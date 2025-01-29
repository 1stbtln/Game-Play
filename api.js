import { logger } from './utils/logger.js';

export const api = {
    // OBS Connection
    connectOBS: async () => window.electronAPI.connectOBS(),
    disconnectOBS: async () => window.electronAPI.disconnectOBS(),
    isOBSConnected: async () => window.electronAPI.isOBSConnected(),

    // Replay Buffer
    startReplayBuffer: async () => {
        const result = await window.electronAPI.startReplayBuffer();
        if (result.success) {
            // Validate buffer length after starting
            await api.validateReplayBufferLength();
        }
        return result;
    },
    stopReplayBuffer: async () => window.electronAPI.stopReplayBuffer(),
    isReplayBufferActive: async () => window.electronAPI.isReplayBufferActive(),

    validateReplayBufferLength: async () => {
        try {
            const response = await window.electronAPI.validateReplayBufferLength();
            if (!response.isValid) {
                console.warn('Replay buffer length mismatch:', response.message);
            }
            return response;
        } catch (error) {
            console.error('Error validating replay buffer length:', error);
            throw error;
        }
    },

    // Clips Management
    getClipList: async () => window.electronAPI.getClipList(),
    getValidationPhotos: async () => window.electronAPI.getValidationPhotos(),
    deleteClip: async (filePath) => window.electronAPI.deleteClip(filePath),
    
    invalidatePhoto: async (photoPath) => {
        try {
            const result = await window.electronAPI.invalidatePhoto(photoPath);
            if (result.success) {
                logger.success(`Invalidated photo and associated clip: ${path.basename(photoPath)}`);
            }
            return result;
        } catch (error) {
            logger.error(`Failed to invalidate photo: ${error.message}`);
            throw error;
        }
    },

    // Config Management
    readConfig: async () => window.electronAPI.readConfigFile(),
    saveConfig: async (config) => window.electronAPI.saveConfigFile(config),

    // Trigger Detection
    startTriggerDetection: async () => {
        logger.process('Starting trigger detection...');
        return window.electronAPI.startTriggerDetection();
    },
    stopTriggerDetection: async () => {
        try {
            logger.process('Stopping trigger detection and validating session...');
            const result = await window.electronAPI.stopTriggerDetection();
            
            if (result.success) {
                if (result.validationResults) {
                    const { validPhotos, failedPhotos } = result.validationResults;
                    logger.success(`Session stopped. ${validPhotos.length} photos validated, ` +
                        `${failedPhotos.length} failed`);
                    
                    if (failedPhotos.length > 0) {
                        logger.warn('Some clips were removed due to failed validation:');
                        failedPhotos.forEach(photo => {
                            logger.warn(`- Failed photo: ${photo.name}`);
                        });
                    }
                } else {
                    logger.success('Trigger detection stopped');
                }
            } else {
                logger.error('Failed to stop trigger detection');
            }
            
            return result;
        } catch (error) {
            logger.error(`Error stopping trigger detection: ${error.message}`);
            throw error;
        }
    },
    isTriggerDetectionActive: async () => window.electronAPI.isTriggerDetectionActive(),

    // Montage Generation
    generateMontage: async () => {
        try {
            logger.process('Starting montage generation...');
            await window.electronAPI.generateMontage();
            logger.success('Montage generation completed');
        } catch (error) {
            logger.error(`Montage generation failed: ${error.message}`);
            throw error;
        }
    },
    getMontageSettings: async () => window.electronAPI.getMontageSettings(),
    saveMontageSettings: async (settings) => window.electronAPI.saveMontageSettings(settings),

    // Add new custom montage method
    generateCustomMontage: async (settings) => {
        try {
            if (!settings?.clips?.length) {
                throw new Error('No clips specified for montage');
            }
            
            // Log what we're sending to main process
            console.log('Sending montage settings:', {
                clips: settings.clips,
                audioFile: settings.audioFile,
                clipVolume: settings.clipVolume,
                musicVolume: settings.musicVolume,
                outroPath: settings.outroPath,
                outputFileName: settings.outputFileName
            });

            const result = await window.electronAPI.generateCustomMontage(settings);
            
            if (!result?.success) {
                throw new Error(result?.error || 'Montage generation failed');
            }

            return result;
        } catch (error) {
            console.error('Error in generateCustomMontage:', error);
            throw error;
        }
    },

    // Audio Management
    getAudioFiles: async () => window.electronAPI.getAudioFiles(),
    downloadFile: async (url, savePath) => window.electronAPI.downloadFile(url, savePath),

    searchAudioSamples: async (query) => {
        try {
            console.log('API: Searching for audio samples:', query); // Debug log
            const response = await window.electronAPI.searchAudioSamples(query);
            console.log('API: Search response:', response); // Debug log

            // Ensure we return the complete response object
            return response;
        } catch (error) {
            console.error('API: Error searching audio samples:', error);
            throw error; // Re-throw to allow handling in the UI
        }
    },

    getAudioDetails: async (id) => {
        try {
            console.log('API: Getting audio details for:', id); // Debug log
            const response = await window.electronAPI.getAudioDetails(id);
            console.log('API: Details response:', response); // Debug log
            return response;
        } catch (error) {
            console.error('API: Error fetching audio details:', error);
            throw error; // Re-throw to allow handling in the UI
        }
    },

    deleteAudioFile: async (filename) => {
        try {
            await window.electronAPI.deleteAudioFile(filename);
            return { success: true };
        } catch (error) {
            console.error('Error deleting audio file:', error);
            throw error;
        }
    },

    // Event Listeners
    onLog: (callback) => window.electronAPI.on('log', callback),
    onOBSDisconnected: (callback) => window.electronAPI.on('obs-disconnected', callback),
    onStreamUrl: (callback) => window.electronAPI.on('stream-url', callback),
    onTriggerDetected: (callback) => window.electronAPI.on('trigger-detected', callback),

    // Add validation results handler
    onValidationResults: (callback) => window.electronAPI.on('validation-results', callback),

    // Helper method for handling downloads
    async downloadAndSaveAudio(sample) {
        if (!sample || !sample.previews || !sample.previews['preview-hq-mp3']) {
            throw new Error('Invalid audio sample data');
        }
    
        const fileUrl = sample.previews['preview-hq-mp3'];
        const fileName = `${sample.name.toLowerCase()}`
            .replace(/[^a-z0-9]/gi, '_') // Replace special chars with underscore
            .replace(/_+/g, '_')         // Replace multiple underscores with single
            .replace(/^_|_$/g, '')       // Remove leading/trailing underscores
            + '.mp3';
        const savePath = `assets/audioAssets/${fileName}`;
    
        try {
            const savedPath = await window.electronAPI.downloadFile(fileUrl, savePath);
            console.log('File saved to:', savedPath);
            return savedPath;
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    },    

    // Settings Window
    openSettings: async () => {
        try {
            await window.electronAPI.openSettings();
        } catch (error) {
            console.error('Error opening settings:', error);
            throw new Error('Failed to open settings window');
        }
    },

    openFileLocation: async (filePath) => window.electronAPI.openFileLocation(filePath),

    exportFile: async (sourcePath, targetDir) => window.electronAPI.exportFile(sourcePath, targetDir),

    async validateSessionClips(sessionId) {
        try {
            const result = await window.electronAPI.validateSessionClips(sessionId);
            
            if (result.success) {
                const validCount = result.validPhotos?.length || 0;
                const invalidCount = result.failedPhotos?.length || 0;
                
                logger.process(`Validation complete: ${validCount} valid, ${invalidCount} invalid`);
                
                if (invalidCount > 0) {
                    logger.warn(`Removed ${invalidCount} invalid clips and their validation photos`);
                    result.failedPhotos.forEach(photo => {
                        logger.warn(`- Removed: ${photo.name}`);
                    });
                }
            }
            
            return result;
        } catch (error) {
            logger.error(`Validation failed: ${error.message}`);
            throw error;
        }
    }
};
