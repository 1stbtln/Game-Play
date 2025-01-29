const { app, BrowserWindow, ipcMain, shell, dialog, protocol } = require('electron');
const https = require('https');
const path = require('path');
const OBSWebSocket = require('obs-websocket-js').OBSWebSocket;
const fs = require('fs');
const { exec } = require('child_process');
const TriggerDetection = require('./triggerDetection'); 
const { concatenateVideos } = require('./videoEditor'); 
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const net = require('net');
const axios = require('axios');
const chokidar = require('chokidar');
const metadataManager = require('./metadataManager');
const { validateSessionPhotos } = require('./validationProcessor');
const bucketName = 'gameplay-clip-validation';
const dotenv = require('dotenv').config();
const AWS = require('aws-sdk');
const { PATHS, AWS: AWS_CONSTANTS } = require('./constants');
const ValidationService = require('./services/validationService');
const validator = new ValidationService();

const basePath = path.join(__dirname);
const clipsDirectory = path.join(basePath, 'clips');
const audioAssetsDirectory = path.join(basePath, 'assets', 'audioAssets');
const validationPhotosPath = path.join(basePath, 'validationPhotos');
const configPath = path.join(basePath, 'config', 'config.json');
const sessionLogPath = path.join(basePath, 'config', 'sessions.json');
const montageMetadataPath = path.join(basePath, 'config', 'montage-metadata.json');

[clipsDirectory, audioAssetsDirectory, validationPhotosPath, path.dirname(configPath)].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

let fileWatcher = null;

if (!fs.existsSync(sessionLogPath)) {
    fs.writeFileSync(sessionLogPath, JSON.stringify({ sessions: [] }, null, 2));
}

AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    params: {
        Bucket: process.env.AWS_BUCKET_NAME || 'gameplay-clip-validation'
    }
});

const s3Client = new AWS.S3();

if (!fs.existsSync(configPath)) {
    const defaultConfig = {
        obs: {
            host: 'localhost',
            port: 4455,
            password: ''
        },
        montage: {
            backgroundMusic: '',
            transitionType: 'cut',
            replayBufferLength: 30
        }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
}

let mainWindow;
let obsClient = null;
let isConnectedToOBS = false;
let triggerDetection = null;
let streamServer = null;
let isTriggerDetectionActive = false;
let currentSession = null;

const config = {
    obsHost: 'localhost',
    obsPort: 4455,
    obsPassword: '',
};

function createMainWindow() {
    protocol.registerFileProtocol('file', (request, callback) => {
        const filePath = decodeURIComponent(request.url.slice('file:///'.length));
        callback({ path: filePath });
    });

    mainWindow = new BrowserWindow({
        width: 1340,
        height: 800,
        transparent: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: true,
            sandbox: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            protocols: ['file'],
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

let settingsWindow = null;

function createSettingsWindow() {
    settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        }
    });

    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
    
    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

ipcMain.handle('open-settings', () => {
    if (!settingsWindow) {
        createSettingsWindow();
    } else {
        settingsWindow.focus();
    }
});

const streamPort = 8080;

async function findAvailablePort(startPort) {
    const isPortAvailable = (port) => {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port);
        });
    };

    try {
        let port = startPort;
        while (!(await isPortAvailable(port))) {
            port++;
            if (port > startPort + 1000) {
                throw new Error('No available ports found');
            }
        }
        return port;
    } catch (error) {
        console.error('Error in findAvailablePort:', error);
        throw error;
    }
}

function sendToWindow(channel, ...args) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}

function formatTimestamp(date, includeUnderscore = true) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
    });
    
    const formattedTime = formatter.format(date);
    console.log('Formatted timestamp:', {
        input: date,
        output: formattedTime,
        timeZone: 'America/New_York'
    });
    
    return formattedTime;
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
}

function updateButtonState(buttonId, enabled) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-button-state', buttonId, enabled);
    }
}

async function connectToOBS() {
    try {
        if (isConnectedToOBS) {
            console.log('Already connected to OBS.');
            return { success: true, message: 'Already connected to OBS' };
        }

        const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const { host, port, password } = configData.obs;
        
        console.log(`Attempting to connect to OBS at ${host}:${port}...`);
        
        if (!obsClient) {
            obsClient = new OBSWebSocket();
        }

        await obsClient.connect(`ws://${host}:${port}`, password);
        isConnectedToOBS = true;
        console.log('Successfully connected to OBS');

        if (currentSession) {
            await Promise.all([
                obsClient.call('SetFilenameFormatting', {
                    'filename-formatting': 'Replay__%CCYY-%MM-%DD_%hh-%mm-%ss'
                }),
                obsClient.call('SetProfileParameter', {
                    parameterCategory: 'Output',
                    parameterName: 'RecFormat',
                    parameterValue: 'mp4'
                }),
                obsClient.call('SetProfileParameter', {
                    parameterCategory: 'SimpleOutput',
                    parameterName: 'RecRBPrefix',
                    parameterValue: `${currentSession.id}_`
                }),
                obsClient.call('SetProfileParameter', {
                    parameterCategory: 'SimpleOutput',
                    parameterName: 'RecRBSuffix',
                    parameterValue: ''
                })
            ]);
        }

        obsClient.on('ConnectionClosed', () => {
            isConnectedToOBS = false;
            mainWindow?.webContents.send('obs-disconnected');
            console.log('Disconnected from OBS');
        });

        return { success: true, message: 'Successfully connected to OBS' };

    } catch (error) {
        isConnectedToOBS = false;
        console.error('Error connecting to OBS:', error);
        throw new Error(`Failed to connect to OBS: ${error.message}`);
    }
}

async function startReplayBuffer() {
    if (!isConnectedToOBS) {
        sendToWindow('log', 'Cannot start replay buffer: OBS not connected');
        return false;
    }

    try {
        const { outputActive } = await obsClient.call('GetReplayBufferStatus');
        if (outputActive) {
            sendToWindow('log', 'Replay buffer is already running');
            return true;
        }

        await obsClient.call('StartReplayBuffer');
        sendToWindow('log', 'Replay buffer started successfully');
        return true;
    } catch (error) {
        sendToWindow('log', `Failed to start replay buffer: ${error.message}`);
        return false;
    }
}

function getCurrentSessionId() {
    try {
        const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
        if (!sessions.sessions || sessions.sessions.length === 0) {
            console.error('No sessions found in sessions.json');
            return null;
        }

        const activeSession = sessions.sessions.find(s => !s.endTime || s.endTime === "null");
        if (activeSession) {
            console.log('Found active session:', {
                id: activeSession.id,
                startTime: activeSession.startTime,
                endTime: activeSession.endTime
            });
            currentSession = activeSession;
            return activeSession.id;
        }

        console.warn('No active session found in sessions.json');
        return null;
    } catch (error) {
        console.error('Error getting current session ID:', error);
        return null;
    }
}

function getSimpleTestFormat() {
    return 'debug_%CCYY-%MM-%DD_%hh-%mm-%ss';
}

async function saveReplayBuffer() {
    if (!isConnectedToOBS) {
        sendToWindow('log', 'OBS not connected. Cannot save replay buffer.');
        return false;
    }

    const startTime = Date.now();
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`[${new Date().toISOString()}] Delayed replay save by 1000ms`);

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const expectedLength = config.montage.replayBufferLength;

        console.log(`[${new Date().toISOString()}] Requesting replay buffer save`);
        await obsClient.call('SaveReplayBuffer');

        const { replayBufferSeconds } = await obsClient.call('GetProfileParameter', {
            parameterCategory: 'SimpleOutput',
            parameterName: 'RecRBTime'
        });

        const saveTime = Date.now() - startTime;
        console.log(`Replay buffer save completed in ${saveTime}ms`);

        if (parseInt(replayBufferSeconds) !== expectedLength) {
            console.warn(`Replay buffer length mismatch: OBS=${replayBufferSeconds}s, Config=${expectedLength}s`);
            sendToWindow('log', `Warning: Replay buffer length mismatch detected`);
        }

        return true;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to save replay buffer:`, error);
        return false;
    }
}

async function verifyReplayBufferLength() {
    if (!isConnectedToOBS) return false;

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const expectedLength = config.montage.replayBufferLength;

        await obsClient.call('SetProfileParameter', {
            parameterCategory: 'SimpleOutput',
            parameterName: 'RecRBTime',
            parameterValue: expectedLength.toString()
        });

        console.log(`[${new Date().toISOString()}] Verified replay buffer length: ${expectedLength}s`);
        return true;
    } catch (error) {
        console.error('Failed to verify replay buffer length:', error);
        return false;
    }
}

async function startTriggerDetection() {
    if (!triggerDetection) {
        const sessionId = uuidv4().split('-')[0];
        
        const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
        const newSession = {
            id: sessionId,
            startTime: new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric'
            }).format(new Date()),
            endTime: null
        };
        sessions.sessions.push(newSession);
        fs.writeFileSync(sessionLogPath, JSON.stringify(sessions, null, 2));

        await obsClient.call('SetFilenameFormatting', {
            'filename-formatting': `${sessionId}_%CCYY-%MM-%DD_%hh-%mm-%ss`
        });

        const triggerPhrases = ['you', 'knocked', 'out', 'knock', 'ou'];
        triggerDetection = new TriggerDetection(triggerPhrases);
        triggerDetection.start();
        isTriggerDetectionActive = true;
        
        return true;
    }
    return false;
}

async function validateCurrentSession() {
    try {
        const sessionId = getCurrentSessionId();
        if (!sessionId) {
            throw new Error('No active session found to validate');
        }

        const validationPhrases = ['KILLED', 'Kill', 'finally', 'fin', 'with', 'wit', 'KNOCKED', 'KNOCK', 'OUT'];
        const results = await validateSessionPhotos(
            sessionId,
            validationPhotosPath,
            validationPhrases
        );

        if (results.failedPhotos.length > 0) {
            const files = fs.readdirSync(clipsDirectory);
            for (const failedPhoto of results.failedPhotos) {
                const matchingVideo = files.find(file => {
                    const photoTimestamp = failedPhoto.timestamp || '';
                    const photoName = failedPhoto.name || '';
                    return file.includes(photoTimestamp) || 
                           (photoName && file.includes(photoName.replace('vPhoto_', '')));
                });
                
                if (matchingVideo) {
                    const videoPath = path.join(clipsDirectory, matchingVideo);
                    try {
                        await fs.promises.unlink(videoPath);
                        console.log(`Deleted invalid clip: ${matchingVideo}`);
                    } catch (error) {
                        console.error(`Failed to delete invalid clip: ${matchingVideo}`, error);
                    }
                }
            }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('validation-results', results);
        }

        sendToWindow('log', `Validation completed. Valid: ${results.validPhotos.length}, ` +
            `Failed: ${results.failedPhotos.length}`);

        return { success: true, results };
    } catch (error) {
        console.error('Error in validateCurrentSession:', error);
        return { success: false, error: error.message };
    }
}

ipcMain.handle('validateCurrentSession', validateCurrentSession);

async function verifyReplayBufferLength() {
    if (!isConnectedToOBS) return false;

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const expectedLength = config.montage.replayBufferLength;

        await obsClient.call('SetProfileParameter', {
            parameterCategory: 'SimpleOutput',
            parameterName: 'RecRBTime',
            parameterValue: expectedLength.toString()
        });

        console.log(`[${new Date().toISOString()}] Verified replay buffer length: ${expectedLength}s`);
        return true;
    } catch (error) {
        console.error('Failed to verify replay buffer length:', error);
        return false;
    }
}

function startTriggerDetection() {
    const triggerPhrases = ['KILLED', 'Kill', 'finally', 'fin', 'with', 'wit', 'KNOCKED', 'KNOCK', 'OUT'];
    if (!triggerDetection) {
        if (!isConnectedToOBS) {
            sendToWindow('log', 'Please connect to OBS first');
            return false;
        }

        obsClient.call('GetReplayBufferStatus').then(async ({ outputActive }) => {
            if (!outputActive) {
                sendToWindow('log', 'Replay buffer is not running. Please start it first.');
                return false;
            }

            const sessionId = uuidv4().split('-')[0];
            currentSession = {
                id: sessionId,
                startTime: formatTimestamp(new Date()),
                endTime: null
            };

            const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
            sessions.sessions.push(currentSession);
            fs.writeFileSync(sessionLogPath, JSON.stringify(sessions, null, 2));

            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            triggerDetection = new TriggerDetection(triggerPhrases, config.obs);
            
            triggerDetection.on('trigger-detected', async (eventData) => {
                if (eventData.replaySaved) {
                    sendToWindow('log', `Trigger detected and replay saved`);
                }
            });
            
            triggerDetection.start();
            sendToWindow('log', `Started detection session: ${sessionId}`);
            return true;
        }).catch(error => {
            sendToWindow('log', 'Error checking replay buffer status. Please try again.');
            return false;
        });
    }
}

async function stopTriggerDetection() {
    if (triggerDetection) {
        try {
            const activeSessionId = currentSession?.id;

            triggerDetection.stop();
            triggerDetection = null;

            if (activeSessionId) {
                const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
                const sessionIndex = sessions.sessions.findIndex(s => s.id === activeSessionId);
                if (sessionIndex !== -1) {
                    sessions.sessions[sessionIndex].endTime = formatTimestamp(new Date(), false);
                    fs.writeFileSync(sessionLogPath, JSON.stringify(sessions, null, 2));
                }

                sendToWindow('log', `Stopping trigger detection - Session ${activeSessionId} ended`);

                const files = fs.readdirSync(clipsDirectory)
                    .filter(file => file.startsWith('Replay'))
                    .sort((a, b) => {
                        const statsA = fs.statSync(path.join(clipsDirectory, a));
                        const statsB = fs.statSync(path.join(clipsDirectory, b));
                        return statsA.mtime - statsB.mtime;
                    });

                let counter = 1;
                for (const file of files) {
                    const oldPath = path.join(clipsDirectory, file);
                    const timestamp = file.match(/_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/)?.[1] || '';
                    const extension = path.extname(file);
                    const newFileName = `${activeSessionId}_${timestamp}_${counter}${extension}`;
                    const newPath = path.join(clipsDirectory, newFileName);

                    try {
                        fs.renameSync(oldPath, newPath);
                        console.log(`Renamed replay file: ${file} -> ${newFileName}`);
                        counter++;
                    } catch (error) {
                        console.error(`Failed to rename file: ${file}`, error);
                    }
                }

                sendToWindow('log', `Renamed ${counter - 1} replay files`);
            }

            currentSession = null;
            isTriggerDetectionActive = false;
            return { success: true };

        } catch (error) {
            console.error('Error in stopTriggerDetection:', error);
            return { success: false, error: error.message };
        }
    }
    return { success: true };
}

function getTransitionFilter(type, duration = 1) {
    const transitions = {
        cut: {
            filter: null,
            ffmpegOption: null
        },
        crossfade: {
            filter: (i) => `[${i}][${i+1}]xfade=transition=fade:duration=${duration}[v${i+1}]`,
            ffmpegOption: 'fade'
        },
        fade_to_black: {
            filter: (i) => `[${i}]fade=t=out:st=0:d=${duration}[fade${i}];` +
                         `[${i+1}]fade=t=in:st=0:d=${duration}[fadein${i}];` +
                         `[fade${i}][fadein${i}]concat=n=2:v=1:a=0[v${i+1}]`,
            ffmpegOption: 'fade'
        },
        wipe_left: {
            filter: (i) => `[${i}][${i+1}]xfade=transition=wiperight:duration=${duration}[v${i+1}]`,
            ffmpegOption: 'wiperight'
        },
        wipe_right: {
            filter: (i) => `[${i}][${i+1}]xfade=transition=wipeleft:duration=${duration}[v${i+1}]`,
            ffmpegOption: 'wipeleft'
        },
        dissolve: {
            filter: (i) => `[${i}][${i+1}]xfade=transition=dissolve:duration=${duration}[v${i+1}]`,
            ffmpegOption: 'dissolve'
        },
        slide: {
            filter: (i) => `[${i}][${i+1}]xfade=transition=slideright:duration=${duration}[v${i+1}]`,
            ffmpegOption: 'slideright'
        }
    };
    
    return transitions[type] || transitions.cut;
}

async function applyMontageSettings(files, outputPath, tempPath, montageConfig) {
    try {
        console.log('Applying montage settings with config:', montageConfig);

        const settings = {
            transitionType: 'cut',
            backgroundMusic: '',
            ...montageConfig
        };

        console.log('Using settings:', settings);

        if (files.length === 1) {
            const command = `ffmpeg -i "${path.join(clipsDirectory, files[0])}" -c copy "${tempPath}"`;
            console.log('Using single clip command:', command);
            
            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg error:', error);
                        console.error('FFmpeg stderr:', stderr);
                        reject(new Error(`FFmpeg failed: ${stderr}`));
                    } else {
                        console.log('FFmpeg stdout:', stdout);
                        resolve();
                    }
                });
            });

            await fs.promises.rename(tempPath, outputPath);
            return {
                success: true,
                transitionType: settings.transitionType,
                backgroundMusic: settings.backgroundMusic
            };
        }

        let ffmpegCommand;
        if (settings.transitionType === 'cut') {
            const listPath = path.join(clipsDirectory, 'filelist.txt');
            const fileList = files
                .map(file => `file '${path.join(clipsDirectory, file)}'`)
                .join('\n');
            
            await fs.promises.writeFile(listPath, fileList);
            ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${tempPath}"`;
            
            console.log('Using concat command:', ffmpegCommand);
            
            setTimeout(() => fs.promises.unlink(listPath).catch(console.error), 1000);
        } else {
            const { inputs, filterComplex, outputMap } = await buildFilterComplex(files, settings.transitionType);
            
            ffmpegCommand = `ffmpeg ${inputs} -filter_complex "${filterComplex}" ${outputMap} ` +
                          `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${tempPath}"`;
            
            console.log('Using complex filter command:', ffmpegCommand);
            console.log('Filter complex string:', filterComplex);
        }

        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('FFmpeg error:', error);
                    console.error('FFmpeg stderr:', stderr);
                    reject(new Error(`FFmpeg failed: ${stderr}`));
                } else {
                    console.log('FFmpeg stdout:', stdout);
                    resolve();
                }
            });
        });

        if (settings.backgroundMusic) {
            const musicPath = path.join(audioAssetsDirectory, settings.backgroundMusic);
            if (fs.existsSync(musicPath)) {
                try {
                    await addBackgroundMusic(tempPath, musicPath, outputPath);
                } catch (musicError) {
                    console.error('Failed to add background music:', musicError);
                    await fs.promises.rename(tempPath, outputPath);
                }
            } else {
                console.warn(`Background music file not found: ${musicPath}`);
                await fs.promises.rename(tempPath, outputPath);
            }
        } else {
            await fs.promises.rename(tempPath, outputPath);
        }

        return {
            success: true,
            transitionType: settings.transitionType,
            backgroundMusic: settings.backgroundMusic
        };

    } catch (error) {
        console.error('Error in applyMontageSettings:', error);
        return {
            success: false,
            error: error.message,
            transitionType: 'cut',
            backgroundMusic: ''
        };
    }
}

async function addBackgroundMusic(videoPath, musicPath, outputPath) {
    try {
        console.log('Adding background music:', {
            video: videoPath,
            music: musicPath,
            output: outputPath
        });

        if (!fs.existsSync(musicPath)) {
            throw new Error('Background music file not found');
        }

        const hasAudioStream = await new Promise((resolve, reject) => {
            const ffprobeCommand = `ffprobe -v quiet -print_format json -show_streams -select_streams a "${videoPath}"`;
            exec(ffprobeCommand, (error, stdout) => {
                if (error) {
                    console.error('FFprobe error:', error);
                    reject(new Error('Failed to analyze video file'));
                    return;
                }
                try {
                    const data = JSON.parse(stdout);
                    const hasAudio = data.streams && data.streams.length > 0;
                    console.log(`Video audio stream detection: ${hasAudio ? 'Audio found' : 'No audio'}`);
                    resolve(hasAudio);
                } catch (e) {
                    console.error('FFprobe output parsing error:', e);
                    reject(new Error('Failed to parse video analysis'));
                }
            });
        });

        let ffmpegCommand;
        if (hasAudioStream) {
            console.log('Using mixed audio streams command');
            ffmpegCommand = `ffmpeg -i "${videoPath}" -stream_loop -1 -i "${musicPath}" ` +
                `-filter_complex "[0:a]volume=1.0[v1];[1:a]volume=0.3[v2];[v1][v2]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
                `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
        } else {
            console.log('Using music-only command');
            ffmpegCommand = `ffmpeg -i "${videoPath}" -stream_loop -1 -i "${musicPath}" ` +
                `-filter_complex "[1:a]volume=0.3[aout]" ` +
                `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
        }

        console.log('Executing FFmpeg command:', ffmpegCommand);

        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('FFmpeg audio error:', {
                        error: error.message,
                        stderr: stderr
                    });
                    
                    if (stderr.includes('No such file or directory')) {
                        reject(new Error('One or more input files not found'));
                    } else if (stderr.includes('Invalid data found')) {
                        reject(new Error('Invalid audio file format'));
                    } else {
                        reject(new Error(`Failed to add background music: ${stderr.split('\n')[0]}`));
                    }
                } else {
                    console.log('Background music added successfully');
                    console.log('FFmpeg stdout:', stdout);
                    resolve();
                }
            });
        });

        return true;
    } catch (error) {
        console.error('Error in addBackgroundMusic:', error);
        throw error;
    }
}

async function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            console.warn('Config file not found, creating default config');
            const defaultConfig = {
                obs: {
                    host: 'localhost',
                    port: 4455,
                    password: ''
                },
                montage: {
                    backgroundMusic: '',
                    transitionType: 'cut',
                    replayBufferLength: 30,
                    autoDeleteClips: false,
                    deleteAfterDays: 3,
                    debug: {
                        logReplayBufferEvents: true,
                        validateSavedClips: true
                    }
                }
            };
            await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }

        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        if (!config.montage) {
            throw new Error('Missing montage configuration section');
        }

        const defaultMontage = {
            backgroundMusic: '',
            transitionType: 'cut',
            replayBufferLength: 30,
            autoDeleteClips: false,
            deleteAfterDays: 3,
            debug: {
                logReplayBufferEvents: true,
                validateSavedClips: true
            }
        };

        config.montage = {
            ...defaultMontage,
            ...config.montage,
            debug: {
                ...defaultMontage.debug,
                ...(config.montage.debug || {})
            }
        };

        return config;
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw new Error(`Configuration error: ${error.message}`);
    }
}

async function generateMontage() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
        const outroPath = config.montage?.outroPath || 'assets/videoAssets/Game-Play.mp4';
        const absoluteOutroPath = path.join(__dirname, outroPath);

        const lastSession = sessions.sessions.filter(session => session.startTime && session.endTime).pop();
        if (!lastSession) {
            sendToWindow('log', 'No completed sessions found.');
            return;
        }

        const files = fs.readdirSync(clipsDirectory)
            .filter(file => file.startsWith(lastSession.id))
            .sort()
            .map(file => path.join(clipsDirectory, file));

        if (files.length === 0) {
            sendToWindow('log', `No clips found for session ${lastSession.id}`);
            return;
        }

        if (fs.existsSync(absoluteOutroPath)) {
            files.push(absoluteOutroPath);
        } else {
            console.warn('Outro video not found:', absoluteOutroPath);
        }

        const montageFileName = `montage_${lastSession.id}_${Date.now()}.mp4`;
        const outputPath = path.join(clipsDirectory, montageFileName);
        const backgroundMusic = config.montage?.editorSettings?.selectedMusic ? 
            path.join(audioAssetsDirectory, config.montage.editorSettings.selectedMusic) : 
            null;

        await concatenateVideos(files, outputPath, {
            backgroundMusic,
            clipVolume: (config.montage?.editorSettings?.clipVolume ?? 70) / 100,
            musicVolume: (config.montage?.editorSettings?.musicVolume ?? 30) / 100
        });

        const montageData = {
            fileName: montageFileName,
            clips: files.map(f => path.basename(f)),
            sessionId: lastSession.id,
            clipCount: files.length,
            createdAt: Date.now()
        };

        await metadataManager.addMontageMetadata(montageData);
        sendToWindow('log', `Montage completed: ${montageFileName}`);

    } catch (error) {
        console.error('Error in generateMontage:', error);
        sendToWindow('log', `Error during montage creation: ${error.message}`);
        throw error;
    }
}

async function addMetadata(outputPath, clipCount) {
    try {
        const tempPath = outputPath + '.temp.mp4';
        await fs.promises.rename(outputPath, tempPath);

        const ffmpegCommand = `ffmpeg -i "${tempPath}" -metadata clip_count="${clipCount}" -metadata encoding_tool="OBS Clip Manager" -c:v copy -c:a copy -movflags +faststart "${outputPath}"`;
        
        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, (error, stdout, stderr) => {
                fs.unlink(tempPath, () => {});
                
                if (error) {
                    console.error('FFmpeg metadata error:', error);
                    console.error('FFmpeg stderr:', stderr);
                    reject(error);
                } else {
                    console.log(`Successfully added metadata: clip_count=${clipCount}`);
                    resolve();
                }
            });
        });

        const verifyCommand = `ffprobe -v quiet -print_format json -show_format "${outputPath}"`;
        const metadata = await new Promise((resolve, reject) => {
            exec(verifyCommand, (error, stdout) => {
                if (error) {
                    console.error('FFprobe verification error:', error);
                    resolve(null);
                } else {
                    try {
                        const data = JSON.parse(stdout);
                        resolve(data.format.tags);
                    } catch (e) {
                        console.error('Metadata parsing error:', e);
                        resolve(null);
                    }
                }
            });
        });

        console.log('Verification metadata:', metadata);

    } catch (error) {
        console.error('Error adding metadata:', error);
        throw error;
    }
}

ipcMain.handle('connectOBS', connectToOBS);
ipcMain.handle('startReplayBuffer', startReplayBuffer);
ipcMain.handle('generateMontage', generateMontage);
ipcMain.handle('startTriggerDetection', async () => {
    try {
        startTriggerDetection();
        isTriggerDetectionActive = true;
        return true;
    } catch (error) {
        console.error('Error starting trigger detection:', error.message);
        throw error;
    }
});
ipcMain.handle('stopTriggerDetection', async () => {
    try {
        stopTriggerDetection();
        isTriggerDetectionActive = false;
        return true;
    } catch (error) {
        console.error('Error stopping trigger detection:', error.message);
        throw error;
    }
});
ipcMain.handle('isTriggerDetectionActive', () => isTriggerDetectionActive);

ipcMain.handle('getClipList', async () => {
    try {
        return fs.readdirSync(clipsDirectory).filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));
    } catch (error) {
        console.error('Error fetching clips:', error);
        return [];
    }
});

ipcMain.handle('get-validation-photos', async () => {
    try {
        const files = await fs.promises.readdir(validationPhotosPath);
        const photos = files
            .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
            .map(file => path.join(validationPhotosPath, file));

        console.log('Found validation photos:', photos);
        return photos;
    } catch (error) {
        console.error('Error reading validation photos:', error);
        return [];
    }
});

ipcMain.handle('downloadFile', async (event, fileUrl, savePath) => {
    if (!fileUrl || typeof fileUrl !== 'string') {
        throw new Error('Invalid file URL');
    }

    const fullPath = path.join(__dirname, 'assets', 'audioAssets', path.basename(savePath));
    console.log('Downloading to:', fullPath);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(fullPath);
        const protocol = fileUrl.startsWith('https:') ? https : http;

        const request = protocol.get(fileUrl, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(fullPath, () => {});
                reject(new Error(`Server returned status code: ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    console.log('Download completed:', fullPath);
                    resolve(fullPath);
                });
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.unlink(fullPath, () => {});
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.abort();
            file.close();
            fs.unlink(fullPath, () => {});
            reject(new Error('Download timeout'));
        });
    });
});

ipcMain.handle('save-config-file', async (event, newConfig) => {
    try {
        let existingConfig = {};
        if (fs.existsSync(configPath)) {
            existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }

        const mergedConfig = {
            ...existingConfig,
            obs: {
                ...existingConfig.obs,
                ...newConfig.obs
            },
            montage: {
                ...existingConfig.montage,
                editorSettings: {
                    ...(existingConfig.montage?.editorSettings || {}),
                    ...(newConfig.montage?.editorSettings || {})
                }
            }
        };

        fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving config file:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('read-config-file', async () => {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            console.log('Config file read successfully:', data);
            return JSON.parse(data);
        }
        return { obs: { host: 'localhost', port: 4455, password: '' } };
    } catch (error) {
        console.error('Error reading config file:', error);
        return { obs: { host: 'localhost', port: 4455, password: '' } };
    }
});

ipcMain.handle('readFile', async (_, filePath) => {
    return fs.promises.readFile(filePath, 'utf-8');
});

ipcMain.handle('writeFile', async (_, filePath, data) => {
    await fs.promises.writeFile(filePath, data);
});

ipcMain.handle('listFiles', async (_, directoryPath) => {
    return fs.promises.readdir(directoryPath);
});

ipcMain.handle('get-audio-files', async () => {
    try {
        const dirContents = await fs.promises.readdir(audioAssetsDirectory, { withFileTypes: true });
        
        const audioFiles = dirContents
            .filter(dirent => dirent.isFile() && dirent.name.toLowerCase().endsWith('.mp3'))
            .map(dirent => dirent.name);

        console.log('Found MP3 files:', audioFiles);
        return audioFiles;
    } catch (error) {
        console.error('Error reading audio files:', error);
        throw error;
    }
});

ipcMain.handle('save-montage-settings', async (event, settings) => {
    try {
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        const newConfig = {
            ...existingConfig,
            montage: {
                ...existingConfig.montage,
                ...settings
            }
        };

        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        console.log('Saved montage settings:', settings);
        console.log('New config:', newConfig);
        
        return { success: true };
    } catch (error) {
        console.error('Error saving montage settings:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-montage-settings', async () => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config.montage || {
            backgroundMusic: '',
            transitionType: 'cut',
            replayBufferLength: 30,
            autoDeleteClips: false,
            deleteAfterDays: 3
        };
    } catch (error) {
        console.error('Error reading montage settings:', error);
        return {
            backgroundMusic: '',
            transitionType: 'cut',
            replayBufferLength: 30,
            autoDeleteClips: false,
            deleteAfterDays: 3
        };
    }
});

async function deleteOldClips() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (!config.montage.autoDeleteClips) return;

        const files = fs.readdirSync(clipsDirectory);
        const now = new Date();
        const deleteAfterDays = config.montage.deleteAfterDays;

        files.forEach(file => {
            const filePath = path.join(clipsDirectory, file);
            const stats = fs.statSync(filePath);
            const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24);

            if (fileAge > deleteAfterDays) {
                fs.unlinkSync(filePath);
                console.log(`Deleted old clip: ${file}`);
            }
        });
    } catch (error) {
        console.error('Error during clip cleanup:', error);
    }
}

setInterval(deleteOldClips, 24 * 60 * 60 * 1000);

deleteOldClips();

ipcMain.handle('get-stream-url', () => {
    if (!streamServer) return null;
    const address = streamServer.address();
    return address ? `ws://localhost:${address.port}` : null;
});

ipcMain.handle('start-streaming', async () => {
    if (!isConnectedToOBS) return false;
    try {
        await obsClient.call('StartVirtualCam');
        return true;
    } catch (error) {
        console.error('Failed to start streaming:', error);
        return false;
    }
});

ipcMain.handle('stop-streaming', async () => {
    if (!isConnectedToOBS) return false;
    try {
        await obsClient.call('StopVirtualCam');
        return true;
    } catch (error) {
        console.error('Failed to stop streaming:', error);
        return false;
    }
});

ipcMain.handle('isOBSConnected', () => isConnectedToOBS);
ipcMain.handle('disconnectOBS', async () => {
    if (obsClient && isConnectedToOBS) {
        await obsClient.disconnect();
        isConnectedToOBS = false;
        sendToWindow('log', 'Disconnected from OBS.');
    }
});

ipcMain.handle('isReplayBufferActive', async () => {
    if (!isConnectedToOBS) return false;
    try {
        const { outputActive } = await obsClient.call('GetReplayBufferStatus');
        return outputActive;
    } catch (error) {
        console.error('Error checking replay buffer status:', error);
        return false;
    }
});

ipcMain.handle('stopReplayBuffer', async () => {
    if (!isConnectedToOBS) {
        sendToWindow('log', 'OBS not connected. Cannot stop replay buffer.');
        return;
    }
    try {
        await obsClient.call('StopReplayBuffer');
        sendToWindow('log', 'Replay buffer stopped.');
    } catch (error) {
        sendToWindow('log', `Failed to stop replay buffer: ${error.message}`);
    }
});

ipcMain.handle('search-audio-samples', async (event, query) => {
    try {
        console.log('Received search request for:', query);
        const apiKey = 'UnRVJo1FqszQZHC7WsLAgGRmHHofkD0DkDeAqVcs';
        
        const url = new URL('https://freesound.org/apiv2/search/text/');
        url.searchParams.append('query', query);
        url.searchParams.append('token', apiKey);
        url.searchParams.append('fields', 'id,name,previews,duration,username');

        console.log('Making request to:', url.toString());

        const response = await axios.get(url.toString());
        console.log('Freesound API raw response:', response.data);
        
        return {
            count: response.data.count,
            results: response.data.results,
            next: response.data.next,
            previous: response.data.previous
        };
    } catch (error) {
        console.error('Audio search error:', error.response || error);
        throw error;
    }
});

ipcMain.handle('get-audio-details', async (event, id) => {
    try {
        console.log('Fetching details for sound:', id);
        const apiKey = 'UnRVJo1FqszQZHC7WsLAgGRmHHofkD0DkDeAqVcs';
        
        const url = `https://freesound.org/apiv2/sounds/${id}/`;
        console.log('Making request to:', url);

        const response = await axios.get(url, {
            params: { token: apiKey }
        });
        
        console.log('Sound details response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Audio details error:', error.response || error);
        throw error;
    }
});

async function retryUnlink(filePath, retries = 5, delay = 1000) {
    if (filePath.includes('audioAssets')) {
        throw new Error('Cannot delete files from audioAssets directory');
    }

    for (let i = 0; i < retries; i++) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Deleted clip: ${filePath}`);
            return { success: true };
        } catch (error) {
            if (error.code === 'EBUSY' && i < retries - 1) {
                console.warn(`File is busy, retrying in ${delay}ms... (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('Error deleting clip:', error);
                throw error;
            }
        }
    }
}

ipcMain.handle('deleteClip', async (event, filePath) => {
    try {
        return await retryUnlink(filePath);
    } catch (error) {
        console.error('Error deleting clip:', error);
        throw error;
    }
});

ipcMain.handle('open-file-location', async (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
        }
        
        if (process.platform === 'win32') {
            await shell.showItemInFolder(filePath);
        } else if (process.platform === 'darwin') {
            exec(`open -R "${filePath}"`);
        } else {
            exec(`xdg-open "${path.dirname(filePath)}"`);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error opening file location:', error);
        throw error;
    }
});

ipcMain.handle('delete-audio-file', async (event, filename) => {
    try {
        const filePath = path.join(audioAssetsDirectory, filename);
        
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
        }
        
        await fs.promises.unlink(filePath);
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.montage?.backgroundMusic === filename) {
            config.montage.backgroundMusic = '';
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error deleting audio file:', error);
        throw error;
    }
});

ipcMain.handle('showSaveDialog', async (event, options) => {
    return dialog.showSaveDialog({
        title: 'Export Clip',
        defaultPath: options.defaultPath,
        filters: [
            { name: 'Video Files', extensions: ['mp4', 'mkv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
});

ipcMain.handle('exportFile', async (event, sourcePath, targetPath) => {
    try {
        await fs.promises.copyFile(sourcePath, targetPath);
        return { success: true };
    } catch (error) {
        console.error('Error exporting file:', error);
        throw error;
    }
});

ipcMain.handle('get-video-metadata', async (_, filepath) => {
    return new Promise((resolve, reject) => {
        const ffprobeCommand = `ffprobe -v quiet -print_format json -show_format "${filepath}"`;
        exec(ffprobeCommand, (error, stdout) => {
            if (error) {
                console.error('FFprobe error:', error);
                resolve(null);
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const metadata = data.format.tags || {};
                console.log('Retrieved metadata:', metadata);
                resolve(metadata);
            } catch (error) {
                console.error('Metadata parsing error:', error);
                resolve(null);
            }
        });
    });
});

ipcMain.handle('get-montage-metadata', async (_, fileName) => {
    try {
        return await metadataManager.getMontageMetadata(fileName);
    } catch (error) {
        console.error('Error fetching montage metadata:', error);
        return null;
    }
});

ipcMain.handle('validateSessionClips', async (event, sessionId) => {
    try {
        const results = await validator.validateSession(sessionId);
        
        if (results.requiresConfirmation && results.failedPhotos.length > 0) {
            const response = await dialog.showMessageBox({
                type: 'warning',
                title: 'Invalid Photos Detected',
                message: `Found ${results.failedPhotos.length} photos that don't contain valid phrases.`,
                detail: 'Would you like to delete these photos and their corresponding clips?',
                buttons: ['Yes, delete them', 'No, keep them'],
                cancelId: 1
            });

            if (response.response === 0) {
                for (const photo of results.failedPhotos) {
                    try {
                        if (photo.path) {
                            await fs.promises.unlink(photo.path);
                            const clipPath = await validator.findMatchingClip(sessionId, photo.name);
                            if (clipPath) {
                                await fs.promises.unlink(clipPath);
                            }
                        }
                    } catch (error) {
                        console.error('Error deleting invalid files:', error);
                    }
                }
            }
        }

        return {
            success: true,
            results,
            validCount: results.validPhotos.length,
            invalidCount: results.failedPhotos.length
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

app.on('ready', () => {
    createMainWindow();
    setupClipWatcher();
});

app.on('before-quit', async () => {
    if (isConnectedToOBS) {
        try {
            await obsClient.call('StopReplayBuffer');
            await obsClient.disconnect();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
    if (streamServer) {
        streamServer.close();
    }
    if (fileWatcher) {
        fileWatcher.close();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function setupClipWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
    }

    ensureDirectoryExists(clipsDirectory);
    
    fileWatcher = chokidar.watch(clipsDirectory, {
        ignored: [
            /(^|[\/\\])\../,
            /\.mp3$/,
            /montage_.*\.mp4$/,
            /vPhoto_.*\.png$/
        ],
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    fileWatcher.on('add', async (filepath) => {
        const filename = path.basename(filepath);
        if (filename.startsWith('Replay')) {
            console.log('New replay file detected:', filename);
        }
    });
}

function getCurrentSession() {
    try {
        const sessions = JSON.parse(fs.readFileSync(sessionLogPath, 'utf-8'));
        const activeSession = sessions.sessions.find(s => !s.endTime);
        if (activeSession) {
            console.log('Found active session:', activeSession);
            return activeSession;
        }
        return null;
    } catch (error) {
        console.error('Error finding active session:', error);
        return null;
    }
}

function mapTransitionToFFmpeg(type) {
    const transitionMap = {
        cut: null,
        dissolve: 'dissolve',
        slide: 'slideright',
        wipe_left: 'wiperight',
        wipe_right: 'wipeleft',
        fade: 'fade',
        fade_to_black: 'fade',
        crossfade: 'fade'
    };

    if (!(type in transitionMap)) {
        throw new Error(`Unsupported transition type: ${type}`);
    }

    return transitionMap[type];
}

async function buildFilterComplex(files, transitionType = 'cut', duration = 1) {
    if (!files || files.length === 0) {
        throw new Error('No files provided');
    }

    if (files.length === 1) {
        return {
            inputs: `-i "${path.join(clipsDirectory, files[0])}"`,
            filterComplex: '',
            outputMap: '-map 0:v -map 0:a?'
        };
    }

    const inputs = files.map(file => `-i "${path.join(clipsDirectory, file)}"`).join(' ');

    let filterComplex;
    let outputMap;

    if (transitionType === 'cut') {
        filterComplex = `concat=n=${files.length}:v=1:a=1[vout][aout]`;
        outputMap = '-map "[vout]" -map "[aout]"';
    } else {
        const transitionMap = {
            'fade': 'fade',
            'dissolve': 'dissolve',
            'slide': 'fade'
        };

        const effect = transitionMap[transitionType] || 'fade';
        let filterParts = [];
        
        for (let i = 0; i < files.length - 1; i++) {
            const currentLabel = i === 0 ? `[0:v]` : `[v${i}]`;
            const nextLabel = `[${i + 1}:v]`;
            const outputLabel = `[v${i + 1}]`;

            filterParts.push(
                `${currentLabel}${nextLabel}xfade=transition=${effect}:duration=${duration}${outputLabel}`
            );
        }

        filterParts.push(
            `${files.map((_, i) => `[${i}:a]`).join('')}concat=n=${files.length}:v=0:a=1[aout]`
        );

        filterComplex = filterParts.join(';');
        outputMap = `-map "[v${files.length - 1}]" -map "[aout]"`;
    }

    return { inputs, filterComplex, outputMap };
}

ipcMain.handle('generateCustomMontage', async (event, settings) => {
    try {
        console.log('Main process received montage settings:', settings);

        if (!settings || !settings.clips || !Array.isArray(settings.clips)) {
            throw new Error('Invalid montage settings');
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const outroPath = config.montage?.outroPath || 'assets/videoAssets/Game-Play.mp4';
        const absoluteOutroPath = path.join(__dirname, outroPath);

        const clipPaths = settings.clips.map(clipId => {
            const absolutePath = path.join(__dirname, 'clips', clipId);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Clip file not found: ${clipId}`);
            }
            return absolutePath;
        });

        if (fs.existsSync(absoluteOutroPath)) {
            clipPaths.push(absoluteOutroPath);
        } else {
            console.warn('Outro video not found:', absoluteOutroPath);
        }

        const outputPath = path.join(__dirname, 'clips', settings.outputFileName);
        
        let backgroundMusicPath = null;
        if (settings.audioFile) {
            backgroundMusicPath = path.join(__dirname, 'assets', 'audioAssets', settings.audioFile);
        }

        await concatenateVideos(clipPaths, outputPath, {
            backgroundMusic: backgroundMusicPath,
            clipVolume: settings.clipVolume,
            musicVolume: settings.musicVolume
        });

        return { success: true };
    } catch (error) {
        console.error('Error in generateCustomMontage:', error);
        return { success: false, error: error.message };
    }
});

