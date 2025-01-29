export class SettingsService {
    constructor() {
        this.defaultSettings = {
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
                editorSettings: {
                    clipVolume: 70,
                    musicVolume: 30,
                    selectedMusic: '',
                    transitionType: 'cut',
                    lastSessionId: null
                }
            }
        };
    }

    async readSettings() {
        try {
            const config = await window.electronAPI.readConfigFile();
            // Deep merge with default settings to ensure all properties exist
            return this.deepMerge(this.defaultSettings, config);
        } catch (error) {
            console.error('Error reading settings:', error);
            return this.defaultSettings;
        }
    }

    async saveSettings(newSettings) {
        try {
            // First read existing settings
            const currentSettings = await this.readSettings();
            
            // Create new merged settings preserving all sections
            const mergedSettings = {
                ...currentSettings,  // Keep all existing settings
                obs: {
                    ...currentSettings.obs,  // Keep existing OBS settings
                    ...newSettings.obs       // Update with new OBS settings
                },
                montage: {
                    ...currentSettings.montage,  // Keep existing montage settings
                    ...(newSettings.montage || {}),  // Update any new montage settings
                    editorSettings: {
                        ...(currentSettings.montage?.editorSettings || {}),  // Keep existing editor settings
                        ...(newSettings.montage?.editorSettings || {})       // Update with new editor settings
                    }
                }
            };

            // Save merged settings
            await window.electronAPI.saveConfigFile(mergedSettings);

            // Check replay buffer if needed
            if (newSettings.montage?.replayBufferLength) {
                const obsStatus = await window.electronAPI.isOBSConnected();
                if (obsStatus) {
                    const validation = await window.electronAPI.validateReplayBufferLength();
                    if (!validation.isValid) {
                        await window.electronAPI.updateOBSReplayBuffer(newSettings.montage.replayBufferLength);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // Helper method to deep merge objects
    deepMerge(target, source) {
        // Return source if target isn't an object
        if (typeof target !== 'object' || target === null) {
            return source;
        }

        let output = { ...target };

        if (typeof source === 'object' && source !== null) {
            Object.keys(source).forEach(key => {
                if (typeof source[key] === 'object' && source[key] !== null) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else if (source[key] !== undefined) {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }

        return output;
    }
}

export const settingsService = new SettingsService();
