const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// Define the audioAssetsDirectory
const basePath = path.join(__dirname);
const audioAssetsDirectory = path.join(basePath, 'clips', 'audioAssets');

// Consolidate API methods into a single object
const electronAPI = {
    // OBS Connection
    connectOBS: () => ipcRenderer.invoke('connectOBS'),
    disconnectOBS: () => ipcRenderer.invoke('disconnectOBS'),
    isOBSConnected: () => ipcRenderer.invoke('isOBSConnected'),

    // Replay Buffer
    startReplayBuffer: () => ipcRenderer.invoke('startReplayBuffer'),
    stopReplayBuffer: () => ipcRenderer.invoke('stopReplayBuffer'),
    isReplayBufferActive: () => ipcRenderer.invoke('isReplayBufferActive'),

    // Clips Management
    getClipList: () => ipcRenderer.invoke('getClipList'),
    getValidationPhotos: () => ipcRenderer.invoke('get-validation-photos'),
    deleteClip: (filePath) => ipcRenderer.invoke('deleteClip', filePath),

    // Config Management
    readConfigFile: () => ipcRenderer.invoke('read-config-file'),
    saveConfigFile: (config) => ipcRenderer.invoke('save-config-file', config),

    // Settings Management
    getMontageSettings: () => ipcRenderer.invoke('get-montage-settings'),
    saveMontageSettings: (settings) => ipcRenderer.invoke('save-montage-settings', settings),

    // Add these audio search methods
    searchAudioSamples: (query) => ipcRenderer.invoke('search-audio-samples', query),
    getAudioDetails: (id) => ipcRenderer.invoke('get-audio-details', id),

    // Add these trigger detection methods
    startTriggerDetection: () => ipcRenderer.invoke('startTriggerDetection'),
    stopTriggerDetection: () => ipcRenderer.invoke('stopTriggerDetection'),
    isTriggerDetectionActive: () => ipcRenderer.invoke('isTriggerDetectionActive'),

    // Add montage generation methods
    generateMontage: () => ipcRenderer.invoke('generateMontage'),
    generateCustomMontage: (settings) => ipcRenderer.invoke('generateCustomMontage', settings),

    // Add the new API methods
    showSaveDialog: (options) => ipcRenderer.invoke('showSaveDialog', options),
    exportFile: (sourcePath, targetPath) => ipcRenderer.invoke('exportFile', sourcePath, targetPath),

    // Event Handling
    on: (channel, callback) => {
        const validChannels = [
            'log', 
            'obs-disconnected', 
            'settings-saved',
            'validation-results'  // Add this channel
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },

    // Other Methods
    downloadFile: async (fileUrl, savePath) => {
        if (!fileUrl || !savePath) {
            throw new Error('Missing required parameters for download');
        }
        return ipcRenderer.invoke('downloadFile', fileUrl, savePath, 'audioAssets');
    },
    getAudioFiles: () => ipcRenderer.invoke('get-audio-files'),

    // Update the getAudioFilePath method to use the defined audioAssetsDirectory
    getAudioFilePath: (filename) => path.join(__dirname, 'assets', 'audioAssets', filename),
    
    // Update the method name to match the IPC handler
    openSettings: () => ipcRenderer.invoke('open-settings'),

    openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
    
    // Add the deleteAudioFile method
    deleteAudioFile: (filename) => ipcRenderer.invoke('delete-audio-file', filename),
    
    // Add the getVideoMetadata method
    getVideoMetadata: (filepath) => ipcRenderer.invoke('get-video-metadata', filepath),

    // Add the getMontageMetadata method
    getMontageMetadata: (fileName) => ipcRenderer.invoke('get-montage-metadata', fileName),

    // Add the validateSessionClips method
    validateSessionClips: (sessionId) => ipcRenderer.invoke('validateSessionClips', sessionId),

    // Add the readFile method
    readFile: (filePath) => {
        const fullPath = path.join(__dirname, filePath);
        try {
            return fs.readFileSync(fullPath, 'utf8');
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    },

    // Add method to read sessions.json
    readConfigFile: () => {
        const sessionsPath = path.join(__dirname, 'config', 'sessions.json');
        try {
            const data = fs.readFileSync(sessionsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading sessions file:', error);
            return { sessions: [] };
        }
    },

    // Add these methods if they don't exist
    getClipUrl: (clipId) => {
        try {
            // Handle different path types
            let fullPath;
            
            // Check if the path is for the outro video or a regular clip
            if (typeof clipId === 'string') {
                if (clipId.includes('assets/videoAssets/')) {
                    // Outro video path - join with __dirname directly
                    fullPath = path.join(__dirname, clipId);
                } else {
                    // Regular clip path - join with clips directory
                    fullPath = path.join(__dirname, 'clips', clipId);
                }
            } else {
                throw new Error('Invalid clip ID provided');
            }

            // Verify file exists
            if (!fs.existsSync(fullPath)) {
                console.error('File not found:', fullPath);
                return null;
            }

            // Convert to URL format
            const urlPath = fullPath.replace(/\\/g, '/');
            const fileUrl = `file:///${urlPath}`;
            
            console.log('Generated clip URL:', {
                clipId,
                fullPath,
                fileUrl
            });
            
            return fileUrl;
        } catch (error) {
            console.error('Error in getClipUrl:', error);
            return null;
        }
    },
    
    validateClipPath: (clipPath) => {
        return fs.existsSync(clipPath);
    },

    // ... other existing methods ...
};

// Expose the API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Remove duplicate exposures and console.log
console.log('Preload script: electronAPI exposed');