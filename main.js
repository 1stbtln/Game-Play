// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { connectToOBS, startReplayBuffer, stopReplayBuffer, startTriggerDetection, stopTriggerDetection } = require('./obsHandler');
const TriggerDetection = require('./triggerDetection');
const { concatenateVideos } = require('./videoEditor');
const fs = require('fs');

const configPath = path.join(__dirname, 'config', 'config.json');

let config;
try {
    config = require(configPath);
    if (!config.save_location) {
        config.save_location = path.join(__dirname, 'renderer', 'clips'); 
        console.warn('save_location was not defined in the config file. Using default:', config.save_location);
    }
} catch (error) {
    console.error('Failed to load config file:', error);
    config = {
        save_location: path.join(__dirname, 'renderer', 'clips') 
    };
}

let mainWindow;
let triggerDetection;
let obsInstance = null;
let isOBSConnected = false;
let lastSaveTime = 0; 
const saveCooldown = 7000; 

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
            webSecurity: true,
        }
    });

    const indexPath = path.join(__dirname, 'renderer', 'index.html');
    console.log("Attempting to load:", indexPath);
    mainWindow.loadFile(indexPath).catch((err) => {
        console.error("Failed to load the index.html file:", err);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

ipcMain.handle('get-clip-list', async () => {
    const fullPath = config.save_location;
    try {
        const files = fs.readdirSync(fullPath);
        return files.filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));
    } catch (error) {
        console.error('Error fetching clips:', error);
        throw error;
    }
});

ipcMain.handle('connectOBS', async () => {
    try {
        obsInstance = await connectToOBS();
        if (obsInstance) {
            isOBSConnected = true;
            mainWindow.webContents.send('log', 'Connected to OBS');

            obsInstance.on('ConnectionClosed', () => {
                console.log("Disconnected from OBS.");
                mainWindow.webContents.send('log', "Disconnected from OBS.");
                isOBSConnected = false;
            });
        }
    } catch (error) {
        mainWindow.webContents.send('log', `Failed to connect to OBS: ${error.message}`);
    }
});

ipcMain.handle('startReplayBuffer', async () => {
    if (!isOBSConnected) {
        mainWindow.webContents.send('log', 'OBS is not connected. Cannot start replay buffer.');
        return;
    }
    try {
        await startReplayBuffer(obsInstance);
        mainWindow.webContents.send('log', 'Replay buffer started.');
    } catch (error) {
        mainWindow.webContents.send('log', `Failed to start replay buffer: ${error.message}`);
    }
});

ipcMain.handle('stopReplayBuffer', async () => {
    if (!isOBSConnected) {
        mainWindow.webContents.send('log', 'OBS is not connected. Cannot stop replay buffer.');
        return;
    }
    try {
        await stopReplayBuffer(obsInstance);
        mainWindow.webContents.send('log', 'Replay buffer stopped.');
    } catch (error) {
        mainWindow.webContents.send('log', `Failed to stop replay buffer: ${error.message}`);
    }
});

ipcMain.handle('startTriggerDetection', async () => {
    if (!isOBSConnected) {
        mainWindow.webContents.send('log', 'OBS is not connected. Cannot start trigger detection.');
        return;
    }
    try {
        if (!triggerDetection) {
            const phrasesToDetect = [
                "you knocked out",
                "you knocked",
                "knocked out",
                "ouknock",
                "knock",
                "you",
                "out",
                "kill",
            ];

            triggerDetection = new TriggerDetection(phrasesToDetect);
            triggerDetection.on('trigger-detected', handleTriggerDetected);
            triggerDetection.start();
            mainWindow.webContents.send('log', 'Event detection started successfully.');
        }
    } catch (error) {
        mainWindow.webContents.send('log', `Error starting event detection: ${error.message}`);
    }
});

ipcMain.handle('stopTriggerDetection', async () => {
    if (triggerDetection) {
        triggerDetection.stop();
        triggerDetection = null;
        mainWindow.webContents.send('log', 'Event detection stopped.');
    }
});

ipcMain.handle('saveConfig', async (event, configData) => {
    console.log("Received configuration data:", configData);
    config.obs_host = configData.obsHost;
    config.obs_port = configData.obsPort;
    config.obs_password = configData.obsPassword;
    config.save_location = configData.saveLocation || config.save_location;

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
        console.log("Configuration saved successfully.");
        mainWindow.webContents.send('log', 'Configuration saved successfully.');
    } catch (error) {
        console.error("Failed to save configuration:", error);
        mainWindow.webContents.send('log', `Failed to save configuration: ${error.message}`);
    }
});

async function handleTriggerDetected(phrase) {
    const currentTime = Date.now();
    if (currentTime - lastSaveTime < saveCooldown) {
        console.log('Cooldown period active. Skipping save.');
        mainWindow.webContents.send('log', 'Cooldown period active. Skipping save.');
        return;
    }
    lastSaveTime = currentTime;

    console.log(`Trigger detected: ${phrase}`);
    mainWindow.webContents.send('log', `Trigger detected: ${phrase}`);
    const clipPath = await saveReplayBuffer();
    if (clipPath) {
        console.log(`Replay buffer saved at: ${clipPath}`);
        mainWindow.webContents.send('log', `Replay buffer saved at: ${clipPath}`);
        await appendToClipList(clipPath);
    } else {
        console.error("Failed to save replay buffer: empty clip path.");
        mainWindow.webContents.send('log', "Failed to save replay buffer: empty clip path.");
    }
}

async function saveReplayBuffer() {
    if (!isOBSConnected) {
        console.error("OBS is not connected. Cannot save replay buffer.");
        mainWindow.webContents.send('log', 'OBS is not connected. Cannot save replay buffer.');
        return null;
    }
    try {
        const response = await obsInstance.call('SaveReplayBuffer');
        if (response && response.outputPath) {
            const outputPath = response.outputPath;

            await new Promise(resolve => setTimeout(resolve, 1000));
            const stats = fs.statSync(outputPath);
            if (stats.size === 0) {
                console.error("Replay buffer file is empty. OBS may have failed to write the replay.");
                mainWindow.webContents.send('log', "Replay buffer file is empty. OBS may have failed to write the replay.");
                return null;
            }

            console.log("Replay buffer saved at:", outputPath);
            return outputPath;
        } else {
            console.warn('SaveReplayBuffer command did not return an output path.');
            mainWindow.webContents.send('log', 'SaveReplayBuffer command did not return an output path.');
            return null;
        }
    } catch (error) {
        console.error("Failed to save replay buffer:", error);
        mainWindow.webContents.send('log', `Failed to save replay buffer: ${error.message}`);
        return null;
    }
}

async function appendToClipList(clipPath) {
    if (!config.save_location) {
        console.error('save_location is not defined in the configuration.');
        mainWindow.webContents.send('log', 'Error: save_location is not defined in the configuration.');
        return;
    }
    const clipListPath = path.join(config.save_location, 'clip_list.txt');
    try {
        fs.appendFileSync(clipListPath, `${clipPath}\n`);
        console.log("Clip path written to clip list.");
        mainWindow.webContents.send('log', "Clip path written to clip list.");
    } catch (error) {
        console.error(`Failed to append clip path to clip list: ${error}`);
        mainWindow.webContents.send('log', `Failed to append clip path to clip list: ${error}`);
    }
}

ipcMain.on('edit-video-with-audio', async () => {
    if (!config.save_location) {
        mainWindow.webContents.send('log', 'Error: save_location is not defined in the configuration.');
        console.error('save_location is not defined in the configuration.');
        return;
    }
    const clipListPath = path.join(config.save_location, 'clip_list.txt');
    const clipsDir = config.save_location;
    const outputVideoPath = path.join(clipsDir, 'final_highlight.mp4');
    const audioPath = path.join(__dirname, 'assets', 'Martial.mp3');

    try {
        const clipList = fs.readFileSync(clipListPath, 'utf8').split('\n').filter(Boolean);
        if (clipList.length === 0) {
            console.error('No clips found to concatenate.');
            mainWindow.webContents.send('log', 'No clips found to concatenate.');
            return;
        }

        console.log('Concatenating videos...');
        mainWindow.webContents.send('log', 'Concatenating videos...');
        concatenateVideos(clipList, outputVideoPath, audioPath);
    } catch (error) {
        console.error('Failed to edit video with audio:', error);
        mainWindow.webContents.send('log', `Failed to edit video with audio: ${error.message}`);
    }
});

app.on('window-all-closed', () => {
    console.log('All windows are closed, app will exit.');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

process.on('uncaughtException', (err) => {
    console.error('An uncaught error occurred:', err);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('error', err.toString());
    }
});
