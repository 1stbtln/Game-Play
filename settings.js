document.addEventListener('DOMContentLoaded', async () => {
    const settingsContent = document.getElementById('settingsContent');
    const navButtons = document.querySelectorAll('.settings-nav-button');

    // Define sections
    const sections = {
        obsConfig: `
            <section id="OBSConfiguration" class="obs-configuration-section">
                <h2 class="obs-config-title">OBS Configuration</h2>
                <form id="obsConfigForm" class="obs-config-form">
                    <div class="OBS-form-group">
                        <label for="obsHost" class="obs-form-label">Host:</label>
                        <input type="text" id="obsHost" name="host" class="obs-form-input" placeholder="localhost" />
                    </div>
                    <hr class="settings-divider">
                    <div class="OBS-form-group">
                        <label for="obsPort" class="obs-form-label">Port:</label>
                        <input type="number" id="obsPort" name="port" class="obs-form-input" placeholder="4455" />
                    </div>
                    <hr class="settings-divider">
                    <div class="OBS-form-group">
                        <label for="obsPassword" class="obs-form-label">Password:</label>
                        <input type="password" id="obsPassword" name="password" class="obs-form-input" placeholder="Enter OBS password" />
                    </div>
                    <hr class="settings-divider">
                    <div class="form-actions">
                        <button type="button" id="saveOBSConfigButton" class="obs-config-button">Save OBS Configuration</button>
                    </div>
                </form>
                <div id="obsConfigMessage" class="obs-config-message"></div>
            </section>
        `,
        montageSettings: `
            <section id="montageSettings" class="montage-settings-section">
                <h2 class="montage-setting-title">Montage Settings</h2>
                <div class="settings-content">
                    <div class="form-group">
                        <label for="backgroundMusic" class="settings-label">Background Music</label>
                        <div class="music-select-container">
                            <select id="backgroundMusic" class="settings-dropdown">
                                <option value="">Select audio file...</option>
                            </select>
                            <button class="preview-button" id="previewButton">
                                <img src="./assets/play.png" alt="Play" class="preview-icon play-icon">
                                <img src="./assets/stop.png" alt="Stop" class="preview-icon pause-icon">
                            </button>
                            <audio id="audioPreview" preload="none"></audio>
                        </div>
                    </div>
                    <hr class="settings-divider">
                    <div class="form-group">
                        <label for="autoDeleteClips" class="settings-label">Auto Delete Old Clips</label>
                        <div class="toggle-container">
                            <input type="checkbox" id="autoDeleteClips" class="toggle-input" />
                            <label for="autoDeleteClips" class="toggle-label"></label>
                        </div>
                    </div>
                    <div id="deleteAfterDaysContainer" class="form-group" style="display: none;">
                        <label for="deleteAfterDays" class="settings-label">Delete Clips Older Than (Days)</label>
                        <input type="number" id="deleteAfterDays" class="settings-input" min="1" value="3" />
                    </div>
                    <hr class="settings-divider">
                    <div class="settings-footer">
                        <button id="saveMontageSettings" class="settings-save-button">Save Preferences</button>
                        <div id="montageSettingsMessage" class="settings-message"></div>
                    </div>
                </div>
            </section>
        `
    };

    // Function to wait for elements
    const waitForElement = (id, callback, timeoutMs = 2000) => {
        const element = document.getElementById(id);
        if (element) {
            callback(element);
            return;
        }

        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = document.getElementById(id);
            if (element) {
                clearInterval(interval);
                callback(element);
            } else if (Date.now() - startTime >= timeoutMs) {
                clearInterval(interval);
                console.error(`Timeout waiting for element: ${id}`);
            }
        }, 100);
    };

    async function initOBSConfig() {
        try {
            const config = await window.electronAPI.readConfigFile();
            console.log('Loaded config:', config);

            waitForElement('obsHost', (element) => {
                element.value = config?.obs?.host || 'localhost';
            });
            waitForElement('obsPort', (element) => {
                element.value = config?.obs?.port || 4455;
            });
            waitForElement('obsPassword', (element) => {
                element.value = config?.obs?.password || '';
            });

            // Set up save button handler
            waitForElement('saveOBSConfigButton', (saveButton) => {
                saveButton.addEventListener('click', async () => {
                    const newConfig = {
                        obs: {
                            host: document.getElementById('obsHost').value,
                            port: parseInt(document.getElementById('obsPort').value, 10),
                            password: document.getElementById('obsPassword').value,
                        }
                    };

                    try {
                        await window.electronAPI.saveConfigFile(newConfig);
                        const messageDiv = document.getElementById('obsConfigMessage');
                        if (messageDiv) {
                            messageDiv.textContent = 'OBS Configuration saved successfully!';
                            messageDiv.classList.add('success');
                            setTimeout(() => {
                                messageDiv.textContent = '';
                                messageDiv.classList.remove('success');
                            }, 3000);
                        }
                    } catch (error) {
                        console.error('Error saving config:', error);
                        const messageDiv = document.getElementById('obsConfigMessage');
                        if (messageDiv) {
                            messageDiv.textContent = 'Failed to save OBS Configuration.';
                            messageDiv.classList.add('error');
                        }
                    }
                });
            });

        } catch (error) {
            console.error('Error initializing OBS config:', error);
        }
    }

    // Update the loadAudioFiles function to set the saved value
    async function loadAudioFiles() {
        try {
            console.log('Starting to load audio files...');
            
            const [audioFiles, savedSettings] = await Promise.all([
                window.electronAPI.getAudioFiles(),
                window.electronAPI.getMontageSettings()
            ]);
    
            const dropdown = document.getElementById('backgroundMusic');
            if (!dropdown) {
                console.error('Background music dropdown not found in DOM');
                return;
            }
    
            // Find or create wrapper
            let wrapper = dropdown.closest('.music-controls');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'music-controls';
                dropdown.parentNode.insertBefore(wrapper, dropdown);
                wrapper.appendChild(dropdown);
            } else {
                // Clear existing content except the dropdown
                while (wrapper.firstChild) {
                    if (wrapper.firstChild !== dropdown) {
                        wrapper.removeChild(wrapper.firstChild);
                    }
                }
            }
    
            // Add delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-music-button';
            deleteButton.innerHTML = '<img src="./assets/trash.png" alt="Delete">';
            deleteButton.title = 'Delete selected music';
            wrapper.appendChild(deleteButton);
    
            // Clear and repopulate dropdown
            dropdown.innerHTML = '<option value="">Select audio file...</option>';
            
            if (!Array.isArray(audioFiles) || audioFiles.length === 0) {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "No audio files available";
                option.disabled = true;
                dropdown.appendChild(option);
                return;
            }
    
            // Sort and add files
            const sortedFiles = [...audioFiles].sort((a, b) => a.localeCompare(b));
            sortedFiles.forEach(file => {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file.replace(/\.mp3$/, '')
                                       .replace(/_/g, ' ')
                                       .split(' ')
                                       .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                       .join(' ');
                // Use relative path instead of Node.js path module
                option.dataset.audioPath = `./assets/audioAssets/${file}`;
                if (savedSettings?.backgroundMusic === file) {
                    option.selected = true;
                }
                dropdown.appendChild(option);
            });
    
            // Add delete handler
            deleteButton.addEventListener('click', async () => {
                const selectedFile = dropdown.value;
                if (!selectedFile || !confirm('Are you sure you want to delete this music file?')) {
                    return;
                }
    
                try {
                    await window.electronAPI.deleteAudioFile(selectedFile);
                    
                    // Instead of reloading everything, just update the dropdown
                    const audioFiles = await window.electronAPI.getAudioFiles();
                    
                    // Clear and update dropdown
                    dropdown.innerHTML = '<option value="">Select audio file...</option>';
                    
                    if (!Array.isArray(audioFiles) || audioFiles.length === 0) {
                        const option = document.createElement('option');
                        option.value = "";
                        option.textContent = "No audio files available";
                        option.disabled = true;
                        dropdown.appendChild(option);
                    } else {
                        const sortedFiles = [...audioFiles].sort((a, b) => a.localeCompare(b));
                        sortedFiles.forEach(file => {
                            const option = document.createElement('option');
                            option.value = file;
                            option.textContent = file.replace(/\.mp3$/, '')
                                .replace(/_/g, ' ')
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                .join(' ');
                            option.dataset.audioPath = `file://${window.electronAPI.getAudioFilePath(file)}`;
                            dropdown.appendChild(option);
                        });
                    }
    
                    // Show success message
                    const messageDiv = document.getElementById('montageSettingsMessage');
                    messageDiv.textContent = 'Music file deleted successfully';
                    messageDiv.className = 'settings-message success';
                    setTimeout(() => {
                        messageDiv.textContent = '';
                        messageDiv.className = 'settings-message';
                    }, 3000);
                } catch (error) {
                    console.error('Error deleting music file:', error);
                    const messageDiv = document.getElementById('montageSettingsMessage');
                    messageDiv.textContent = 'Failed to delete music file';
                    messageDiv.className = 'settings-message error';
                }
            });
    
            // Replace the mouseover/mouseout preview with button control
            const audioPreview = document.getElementById('audioPreview');
            const previewButton = document.getElementById('previewButton');
            
            if (previewButton && audioPreview) {
                previewButton.addEventListener('click', () => {
                    const selectedOption = dropdown.selectedOptions[0];
                    if (!selectedOption?.dataset.audioPath) return;

                    if (audioPreview.paused) {
                        audioPreview.src = selectedOption.dataset.audioPath;
                        audioPreview.volume = 0.3;
                        audioPreview.play()
                            .then(() => {
                                previewButton.classList.add('playing');
                            })
                            .catch(err => console.log('Preview playback error:', err));
                    } else {
                        audioPreview.pause();
                        audioPreview.currentTime = 0;
                        previewButton.classList.remove('playing');
                    }
                });

                // Reset button when audio ends
                audioPreview.addEventListener('ended', () => {
                    previewButton.classList.remove('playing');
                });

                // Stop preview when changing selection
                dropdown.addEventListener('change', () => {
                    audioPreview.pause();
                    audioPreview.currentTime = 0;
                    previewButton.classList.remove('playing');
                });
            }
    
        } catch (error) {
            console.error('Error in loadAudioFiles:', error);
            const messageDiv = document.getElementById('montageSettingsMessage');
            if (messageDiv) {
                messageDiv.textContent = `Failed to load audio files: ${error.message}`;
                messageDiv.className = 'settings-message error';
            }
        }
    }

    // Update saveSettings function
    function saveSettings() {
        const settings = {
            backgroundMusic: document.getElementById('backgroundMusic').value,
            autoDeleteClips: document.getElementById('autoDeleteClips').checked,
            deleteAfterDays: parseInt(document.getElementById('deleteAfterDays').value, 10)
        };
        
        window.electronAPI.saveMontageSettings(settings)
            .then(response => {
                if (response.success) {
                    const messageDiv = document.createElement('div');
                    messageDiv.textContent = 'Settings saved successfully!';
                    messageDiv.className = 'success-message';
                    document.querySelector('.settings-content').appendChild(messageDiv);
                    setTimeout(() => messageDiv.remove(), 3000);
                }
            })
            .catch(error => console.error('Error saving settings:', error));
    }

    // Add this function to initialize auto-delete controls
    function initAutoDeleteControls() {
        const autoDeleteCheckbox = document.getElementById('autoDeleteClips');
        const daysContainer = document.getElementById('deleteAfterDaysContainer');

        autoDeleteCheckbox.addEventListener('change', () => {
            daysContainer.style.display = autoDeleteCheckbox.checked ? 'flex' : 'none';
        });
    }

    // Handle navigation button clicks
    navButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const section = button.dataset.section;
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update content
            settingsContent.innerHTML = sections[section];

            // Initialize the section if needed
            if (section === 'obsConfig') {
                initOBSConfig();
            } else if (section === 'montageSettings') {
                await loadAudioFiles();
                const savedSettings = await window.electronAPI.getMontageSettings();
                if (savedSettings) {
                    // Update all form elements with saved values
                    document.getElementById('backgroundMusic').value = savedSettings.backgroundMusic || '';
                    document.getElementById('autoDeleteClips').checked = savedSettings.autoDeleteClips || false;
                    document.getElementById('deleteAfterDays').value = savedSettings.deleteAfterDays || 3;
                    
                    // Show/hide delete days input based on saved state
                    document.getElementById('deleteAfterDaysContainer').style.display = 
                        savedSettings.autoDeleteClips ? 'flex' : 'none';
                }

                // Remove the change event listeners and add click listener for save button
                document.getElementById('saveMontageSettings').addEventListener('click', () => {
                    const settings = {
                        backgroundMusic: document.getElementById('backgroundMusic').value,
                        autoDeleteClips: document.getElementById('autoDeleteClips').checked,   // Make sure this is included
                        deleteAfterDays: parseInt(document.getElementById('deleteAfterDays').value, 10)  // Make sure this is included
                    };
                    
                    console.log('Saving settings:', settings);  // Add this for debugging
                    
                    window.electronAPI.saveMontageSettings(settings)
                        .then(response => {
                            if (response.success) {
                                const messageDiv = document.getElementById('montageSettingsMessage');
                                messageDiv.textContent = 'Settings saved successfully!';
                                messageDiv.className = 'settings-message success';
                                setTimeout(() => {
                                    messageDiv.textContent = '';
                                    messageDiv.className = 'settings-message';
                                }, 3000);
                            }
                        })
                        .catch(error => {
                            const messageDiv = document.getElementById('montageSettingsMessage');
                            messageDiv.textContent = 'Failed to save settings';
                            messageDiv.className = 'settings-message error';
                            console.error('Save error:', error);  // Add this for debugging
                        });
                });
                
                initAutoDeleteControls();
            }
        });
    });

    // Show OBS Config by default
    const defaultButton = document.querySelector('[data-section="obsConfig"]');
    if (defaultButton) {
        defaultButton.click();
    }
});
