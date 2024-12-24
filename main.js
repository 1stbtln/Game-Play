const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const OBSWebSocket = require('obs-websocket-js').OBSWebSocket;
const fs = require('fs');
const { exec } = require('child_process');
const TriggerDetection = require('./triggerDetection'); // Import OCR detection logic

let mainWindow;
let obsClient = null; // OBS WebSocket client
let isConnectedToOBS = false;
let triggerDetection = null; // Instance of TriggerDetection for OCR

const config = {
    obsHost: 'localhost',
    obsPort: 4455,
    obsPassword: '',
};

const clipsDirectory = path.join(__dirname, 'clips');

// Create the main application window
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 1200,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// Connect to OBS
async function connectToOBS() {
    try {
        if (!obsClient) obsClient = new OBSWebSocket();
        await obsClient.connect(`ws://${config.obsHost}:${config.obsPort}`, config.obsPassword);
        isConnectedToOBS = true;

        console.log('Connected to OBS.');
        mainWindow.webContents.send('log', 'Successfully connected to OBS.');
    } catch (error) {
        console.error('Error connecting to OBS:', error.message);
        mainWindow.webContents.send('log', `Error connecting to OBS: ${error.message}`);
    }
}

async function generateMontage() {
    try {
        const files = fs.readdirSync(clipsDirectory).filter(file =>
            file.startsWith(`session_${currentSessionId}_clip_`) && file.endsWith('.mp4')
        );

        if (files.length === 0) {
            mainWindow.webContents.send('log', 'No clips found for the current session.');
            return;
        }

        const listFilePath = path.join(clipsDirectory, 'file_list.txt');
        const fileList = files.map(file => `file '${path.join(clipsDirectory, file)}'`).join('\n');
        fs.writeFileSync(listFilePath, fileList);

        const outputPath = path.join(clipsDirectory, `montage_${currentSessionId}.mp4`);
        const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" -c:v copy -c:a aac "${outputPath}"`;

        exec(ffmpegCommand, (error) => {
            if (error) {
                mainWindow.webContents.send('log', `Error creating montage: ${error.message}`);
                return;
            }
            mainWindow.webContents.send('log', `Montage created successfully: ${outputPath}`);
        });
    } catch (error) {
        mainWindow.webContents.send('log', `Error during montage creation: ${error.message}`);
    }
}

// Start the replay buffer
async function startReplayBuffer() {
    if (!isConnectedToOBS) {
        mainWindow.webContents.send('log', 'OBS not connected. Cannot start replay buffer.');
        return;
    }
    try {
        const { outputActive } = await obsClient.call('GetReplayBufferStatus');
        if (!outputActive) {
            await obsClient.call('StartReplayBuffer');
            mainWindow.webContents.send('log', 'Replay buffer started.');
        } else {
            mainWindow.webContents.send('log', 'Replay buffer is already active.');
        }
    } catch (error) {
        mainWindow.webContents.send('log', `Failed to start replay buffer: ${error.message}`);
    }
}

const { v4: uuidv4 } = require('uuid'); // Ensure uuid is installed
let currentSessionId = uuidv4(); // Initialize session ID

// Save the replay buffer
async function saveReplayBuffer() {
    if (!isConnectedToOBS) {
        mainWindow.webContents.send('log', 'OBS not connected. Cannot save replay buffer.');
        return;
    }
    try {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '_');
        const clipName = `session_${currentSessionId}_clip_${timestamp}.mp4`;
        const outputPath = path.join(clipsDirectory, clipName);

        await obsClient.call('SaveReplayBuffer');
        mainWindow.webContents.send('log', `Replay buffer saved as ${clipName}`);
        return outputPath;
    } catch (error) {
        console.error('Failed to save replay buffer:', error.message);
        mainWindow.webContents.send('log', `Error saving replay buffer: ${error.message}`);
    }
}

// Start OCR and trigger detection
function startTriggerDetection() {
    const triggerPhrases = ['you', 'knocked', 'out', 'knock', 'ou'];
    if (!triggerDetection) {
        triggerDetection = new TriggerDetection(triggerPhrases);
        triggerDetection.on('trigger-detected', async (phrase) => {
            mainWindow.webContents.send('log', `Trigger detected: "${phrase}". Preparing to save replay buffer...`);
            console.log('Trigger detected. Saving replay buffer...');

            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            await saveReplayBuffer();

            console.log('Replay buffer saved after detection.');
        });
        triggerDetection.start();
        mainWindow.webContents.send('log', 'Started OCR and trigger detection.');
        console.log('Started OCR and trigger detection.');
    } else {
        mainWindow.webContents.send('log', 'Trigger detection is already running.');
    }
}

// Stop OCR and trigger detection
function stopTriggerDetection() {
    if (triggerDetection) {
        triggerDetection.stop();
        triggerDetection = null;
        mainWindow.webContents.send('log', 'Stopped OCR and trigger detection.');
        console.log('Stopped OCR and trigger detection.');
    } else {
        mainWindow.webContents.send('log', 'Trigger detection was not running.');
    }
}

// Montageify clips
ipcMain.handle('montageifyClips', async () => {
    try {
        const files = fs.readdirSync(clipsDirectory).filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));

        if (files.length === 0) {
            mainWindow.webContents.send('log', 'No clips found to montage.');
            return;
        }

        // Generate the input file list for FFmpeg
        const listFilePath = path.join(clipsDirectory, 'file_list.txt');
        const fileList = files.map(file => `file '${path.join(clipsDirectory, file)}'`).join('\n');

        // Write to file_list.txt
        fs.writeFileSync(listFilePath, fileList);
        console.log(`Created list file at: ${listFilePath}`);

        const outputFilePath = path.join(clipsDirectory, 'montage.mp4');
        const audioFilePath = path.join(clipsDirectory, 'assets', 'Martial.mp3');

        // FFmpeg command to concatenate clips and add audio
        const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" -i "${audioFilePath}" -map 0:v:0 -map 1:a:0 -shortest -c:v copy -c:a aac "${outputFilePath}"`;

        console.log('Executing FFmpeg command:', ffmpegCommand);

        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg error during montage creation:', error.message);
                mainWindow.webContents.send('log', `Error creating montage: ${error.message}`);
                return;
            }

            console.log('FFmpeg stdout:', stdout);
            console.log('FFmpeg stderr:', stderr);

            if (fs.existsSync(outputFilePath)) {
                mainWindow.webContents.send('log', 'Montage with audio created successfully!');
                console.log('Montage with audio created successfully.');
            } else {
                mainWindow.webContents.send('log', 'FFmpeg completed but no montage.mp4 file was found.');
                console.error('FFmpeg completed but no montage file found.');
            }
        });
    } catch (error) {
        console.error('Error in montageifyClips:', error.message);
        mainWindow.webContents.send('log', `Error in montageifyClips: ${error.message}`);
    }
});

// IPC Handlers

ipcMain.handle('generateMontage', generateMontage);

ipcMain.handle('startNewSession', () => {
    currentSessionId = uuidv4(); // Generate a new session ID
    mainWindow.webContents.send('log', `New session started with ID: ${currentSessionId}`);
});

ipcMain.handle('saveConfig', (_, newConfig) => {
    Object.assign(config, newConfig);
    console.log('Configuration updated:', config);
});

ipcMain.handle('connectOBS', async () => {
    await connectToOBS();
});

ipcMain.handle('startReplayBuffer', async () => {
    await startReplayBuffer();
});

ipcMain.handle('saveReplayBuffer', async () => {
    await saveReplayBuffer();
});

ipcMain.handle('startTriggerDetection', () => {
    startTriggerDetection();
});

ipcMain.handle('stopTriggerDetection', () => {
    stopTriggerDetection();
});

ipcMain.handle('getClipList', async () => {
    try {
        return fs.readdirSync(clipsDirectory).filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));
    } catch (error) {
        console.error('Error fetching clips:', error);
        return [];
    }
});

app.on('ready', () => {
    createMainWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
