import { api } from './api.js';

// Define sections
export const sections = {
    clips: `
        <section id="clips" class="clips-section">
            <div class="clips-header">
                <h2 class="section-title">Clips</h2>
            </div>
            <div id="replayContainer" class="clips-container"></div>
        </section>
    `,
    
    montages: `
        <section id="montages" class="montages-section">
            <div class="clips-header">
                <h2 class="section-title">Montages</h2>
            </div>
            <div id="montageContainer" class="clips-container"></div>
        </section>
    `,
    
    actions: `
        <section id="actions" class="actions-section">
            <h2 class="section-title">Actions</h2>
            <div class="actions-container">
                <div class="action-group">
                    <h3>OBS Controls</h3>
                    <button id="connectOBSButton" class="action-button">Connect to OBS</button>
                    <button id="replayBufferButton" class="action-button">Start Replay Buffer</button>
                </div>
                <div class="action-group">
                    <h3>Detection Controls</h3>
                    <button id="triggerDetectionButton" class="action-button">Start Trigger Detection</button>
                </div>
                <div class="action-group">
                    <h3>Montage Controls</h3>
                    <button id="generateMontageButton" class="action-button">Generate Montage from Last Session</button>
                    <div class="custom-montage-controls">
                        <input type="text" 
                               id="sessionIdInput" 
                               placeholder="Enter Session ID" 
                               class="action-input" 
                               title="The Session ID is an 8-digit alphanumeric code that precedes clip names and uniquely identifies the game during which the clips were recorded.">
                        <button id="generateCustomMontageButton" class="action-button">Custom Montage</button>
                    </div>
                </div>
                <div class="action-group">
                    <h3>Validation Controls</h3>
                    <button id="validateClipsButton" class="action-button">Validate Session Clips</button>
                </div>
            </div>
        </section>
    `,

    validationPhotos: `
        <section id="validationPhotos" class="validation-section">
            <h2 class="section-title">Validation Photos</h2>
            <div id="validationPhotosContainer" class="photos-grid">
                <!-- Photos will be injected here -->
            </div>
        </section>
    `,

    audio: `
        <section id="audio" class="audio-section">
            <h2 class="section-title">Audio</h2>
            <div class="audio-search">
                <input type="text" id="searchInput" placeholder="Search for background music..." />
                <button id="searchButton">Search</button>
            </div>
            <div id="audioResults" class="audio-results">
                <button class="scroll-top">
                    <img src="./assets/up.png" alt="Scroll to top">
                </button>
            </div>
        </section>
    `,
    edit: `
        <section id="edit" class="edit-section">
            <div class="edit-container">
                <div class="parent1">
                    <div class="edit-preview">
                        <video id="editVideoPlayer">
                            <source id="editVideoSource" src="" type="video/mp4">
                        </video>
                    </div>
                </div>
                <div id="editTimelineContainer" class="edit-timeline-container"></div>
            </div>
        </section>
    `
};

// Define section handlers
async function createMontageElement(clip) {
    const metadata = await window.electronAPI.getMontageMetadata(clip);
    
    return `
        <div class="clip-item" data-clip="${clip}">
            <video 
                class="clip-preview" 
                src="clips/${clip}" 
                muted 
                preload="metadata"
                onloadeddata="this.classList.add('loaded')"
            ></video>
            <div class="clip-timestamp">
                <span>Session: ${clip.split('_')[0]}</span>
                ${metadata ? `
                    <span class="clip-count">• ${metadata.clipCount} clips</span>
                    <span class="clip-date">${new Date(metadata.createdAt).toLocaleDateString()}</span>
                ` : ''}
            </div>
        </div>
    `;
}

export const sectionHandlers = {
    clips: async (ui) => {
        const container = document.getElementById('replayContainer');
        if (!container) return;
        
        container.style.opacity = '0';
        
        try {
            const clips = await api.getClipList();
            const clipsElements = clips
                .filter(clipPath => clipPath.endsWith('.mp4') || clipPath.endsWith('.mkv'))
                .map(clipPath => ({
                    path: clipPath,
                    time: new Date(clipPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/) 
                        ? clipPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)[1].replace(/_/g, ' ') 
                        : 0)
                }))
                .sort((a, b) => b.time - a.time)
                .map(({ path, time }) => {
                    // Get just the filename for display
                    const filename = path.split('\\').pop();
                    // Extract session ID from filename - take only the first part before any space or underscore
                    const sessionId = filename.split(/[\s_]/)[0];
                    // Get the proper URI-encoded path with the correct protocol
                    const fullPath = path.startsWith('C:') ? path : `C:/obs-gameplay/src/clips/${path}`;
                    const encodedPath = encodeURI(fullPath)
                        .replace(/#/g, '%23')
                        .replace(/\\/g, '/')
                        .replace(/\s+/g, '%20');
                    
                    return `
                        <div class="clip-item" title="${filename}" data-video-src="file:///${encodedPath}" data-file-path="${fullPath}">
                            <button class="delete-button" title="Delete Clip">
                                <img src="./assets/trash.png" alt="Delete">
                            </button>
                            <button class="folder-button" title="Open Folder">
                                <img src="./assets/folder.png" alt="Open Folder">
                            </button>
                            <button class="export-button" title="Export Clip">
                                <img src="./assets/export.png" alt="Export">
                            </button>
                            <video src="file:///${encodedPath}" 
                                   class="clip-preview" 
                                   preload="metadata"
                                   muted>
                            </video>
                            <div class="clip-timestamp">
                                <div class="session-id-container">
                                    <span>Session ID: ${sessionId}</span>
                                    <button class="copy-button" title="Copy Session ID" data-session-id="${sessionId}">
                                        <img src="./assets/copy.png" alt="Copy">
                                    </button>
                                </div>
                                <span class="clip-date">${time.toLocaleString()}</span>
                                <span class="clip-filename">${filename}</span>
                            </div>
                        </div>
                    `;
                })
                .join('');

            container.innerHTML = clipsElements || '<p class="no-clips">No clips available.</p>';
            
            // Add error handling for video loading
            container.querySelectorAll('video').forEach(video => {
                video.onerror = function() {
                    console.error('Error loading video:', video.src);
                    // Replace errored video with placeholder
                    this.parentElement.innerHTML = `
                        <div class="error-placeholder">
                            <p>Error loading video</p>
                            <small>${this.src}</small>
                        </div>
                    `;
                };

                // Add loaded class when video is loaded
                video.onloadeddata = function() {
                    this.classList.add('loaded');
                };
            });

            // Add click event listeners to play the video in the main player
            container.querySelectorAll('.clip-item').forEach(item => {
                item.addEventListener('click', (event) => {
                    if (event.target.classList.contains('delete-button') || event.target.closest('.delete-button')) return;
                    if (event.target.classList.contains('folder-button') || event.target.closest('.folder-button')) return;
                    
                    const videoPlayerSection = document.getElementById('videoPlayerSection');
                    const videoSrc = item.getAttribute('data-video-src');
                    
                    // Check if the video player section currently contains a photo viewer
                    const photoViewer = videoPlayerSection.querySelector('.photo-viewer');
                    if (photoViewer) {
                        // Replace the photo viewer with the default video player
                        videoPlayerSection.innerHTML = `
                            <video id="videoPlayer" controls class="video-player">
                                <source id="videoSource" src="" type="video/mp4">
                            </video>
                        `;
                    }
                    
                    // Now play the video
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');
                    if (videoPlayer && videoSource) {
                        videoSource.src = videoSrc;
                        videoPlayer.load();
                        videoPlayer.play();
                    }
                });
            });

            // Add click event listeners to delete the video
            container.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering the video play event
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    if (confirm(`Are you sure you want to delete this clip?`)) {
                        try {
                            await api.deleteClip(filePath);
                            clipItem.remove();
                            ui.log(`Deleted clip: ${filePath}`);
                        } catch (error) {
                            console.error('Error deleting clip:', error);
                            ui.log(`Error deleting clip: ${error.message}`);
                            if (error.message.includes('EBUSY')) {
                                setTimeout(async () => {
                                    try {
                                        await api.deleteClip(filePath);
                                        clipItem.remove();
                                        ui.log(`Deleted clip after retry: ${filePath}`);
                                    } catch (retryError) {
                                        console.error('Retry error deleting clip:', retryError);
                                        ui.log(`Retry error deleting clip: ${retryError.message}`);
                                    }
                                }, 1000); // Retry after 1 second
                            }
                        }
                    }
                });
            });

            // Add click event listeners to open the folder
            container.querySelectorAll('.folder-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    await api.openFileLocation(filePath);
                });
            });

            // Add click event listeners to export the clip
            container.querySelectorAll('.export-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    const fileName = filePath.split('\\').pop().split('/').pop(); // Extract filename from path
                    
                    // Open system file dialog for selecting export location
                    const result = await window.electronAPI.showSaveDialog({
                        defaultPath: fileName
                    });
                    
                    if (!result.canceled && result.filePath) {
                        try {
                            await api.exportFile(filePath, result.filePath);
                            ui.log(`Exported clip to: ${result.filePath}`);
                        } catch (error) {
                            console.error('Error exporting clip:', error);
                            ui.log(`Error exporting clip: ${error.message}`);
                        }
                    }
                });
            });

            // Add copy button handlers after creating clips
            container.querySelectorAll('.copy-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    const sessionId = button.getAttribute('data-session-id');
                    try {
                        await navigator.clipboard.writeText(sessionId);
                        button.classList.add('copied');
                        
                        // Reset button after 2 seconds
                        setTimeout(() => {
                            button.classList.remove('copied');
                        }, 2000);
                    } catch (error) {
                        console.error('Failed to copy session ID:', error);
                    }
                });
            });

        } catch (error) {
            console.error('Error loading clips:', error);
            container.innerHTML = '<p class="error-message">Error loading clips.</p>';
        }

        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.2s ease-in';
            container.style.opacity = '1';
        });
    },

    montages: async (ui) => {
        const container = document.getElementById('montageContainer');
        if (!container) return;
        
        container.style.opacity = '0';
        
        try {
            const montages = await api.getClipList();
            const montagePromises = montages
                .filter(clipPath => clipPath.startsWith('montage_'))
                .map(async clipPath => {
                    // Get metadata for each montage
                    const metadata = await window.electronAPI.getMontageMetadata(clipPath);
                    const fullPath = clipPath.startsWith('C:') 
                        ? clipPath 
                        : `C:/obs-gameplay/src/clips/${clipPath}`;
                    const encodedPath = encodeURI(fullPath)
                        .replace(/#/g, '%23')
                        .replace(/\\/g, '/')
                        .replace(/\s+/g, '%20');
                    
                    return {
                        path: clipPath,
                        metadata,
                        encodedPath,
                        fullPath,
                        time: new Date(clipPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/) 
                            ? clipPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)[1].replace(/_/g, ' ') 
                            : 0)
                    };
                });

            const montageElements = (await Promise.all(montagePromises))
                .sort((a, b) => b.time - a.time)
                .map(({ path, metadata, encodedPath, fullPath, time }) => {
                    const filename = path.split('\\').pop();
                    const clipCount = metadata?.clipCount || 'Unknown';
                    const sessionId = metadata?.sessionId || filename.split('_')[1];

                    return `
                        <div class="clip-item" title="${filename}" data-video-src="file:///${encodedPath}" data-file-path="${fullPath}">
                            <button class="delete-button" title="Delete Clip">
                                <img src="./assets/trash.png" alt="Delete">
                            </button>
                            <button class="folder-button" title="Open Folder">
                                <img src="./assets/folder.png" alt="Open Folder">
                            </button>
                            <button class="export-button" title="Export Clip">
                                <img src="./assets/export.png" alt="Export">
                            </button>
                            <video src="file:///${encodedPath}" 
                                   class="clip-preview" 
                                   preload="metadata"
                                   muted>
                            </video>
                            <div class="clip-timestamp">
                                <div class="session-id-container">
                                    <span>Session ID: ${sessionId}</span>
                                    <button class="copy-button" title="Copy Session ID" data-session-id="${sessionId}">
                                        <img src="./assets/copy.png" alt="Copy">
                                    </button>
                                </div>
                                <span class="clip-count">${clipCount}</span>
                                <span class="clip-date">${time.toLocaleString()}</span>
                            </div>
                        </div>
                    `;
                })
                .join('');

            container.innerHTML = montageElements || '<p class="no-clips">No montages available.</p>';
            
            // Add error handling for video loading
            container.querySelectorAll('video').forEach(video => {
                video.onerror = function() {
                    console.error('Error loading video:', video.src);
                    // Replace errored video with placeholder
                    this.parentElement.innerHTML = `
                        <div class="error-placeholder">
                            <p>Error loading video</p>
                            <small>${this.src}</small>
                        </div>
                    `;
                };

                // Add loaded class when video is loaded
                video.onloadeddata = function() {
                    this.classList.add('loaded');
                };
            });

            // Add click event listeners to play the video in the main player
            container.querySelectorAll('.clip-item').forEach(item => {
                item.addEventListener('click', (event) => {
                    if (event.target.classList.contains('delete-button') || event.target.closest('.delete-button')) return;
                    if (event.target.classList.contains('folder-button') || event.target.closest('.folder-button')) return;
                    
                    const videoPlayerSection = document.getElementById('videoPlayerSection');
                    const videoSrc = item.getAttribute('data-video-src');
                    
                    // Check if the video player section currently contains a photo viewer
                    const photoViewer = videoPlayerSection.querySelector('.photo-viewer');
                    if (photoViewer) {
                        // Replace the photo viewer with the default video player
                        videoPlayerSection.innerHTML = `
                            <video id="videoPlayer" controls class="video-player">
                                <source id="videoSource" src="" type="video/mp4">
                            </video>
                        `;
                    }
                    
                    // Now play the video
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');
                    if (videoPlayer && videoSource) {
                        videoSource.src = videoSrc;
                        videoPlayer.load();
                        videoPlayer.play();
                    }
                });
            });

            // Add click event listeners to delete the video
            container.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering the video play event
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    if (confirm(`Are you sure you want to delete this clip?`)) {
                        try {
                            await api.deleteClip(filePath);
                            clipItem.remove();
                            ui.log(`Deleted clip: ${filePath}`);
                        } catch (error) {
                            console.error('Error deleting clip:', error);
                            ui.log(`Error deleting clip: ${error.message}`);
                            if (error.message.includes('EBUSY')) {
                                setTimeout(async () => {
                                    try {
                                        await api.deleteClip(filePath);
                                        clipItem.remove();
                                        ui.log(`Deleted clip after retry: ${filePath}`);
                                    } catch (retryError) {
                                        console.error('Retry error deleting clip:', retryError);
                                        ui.log(`Retry error deleting clip: ${retryError.message}`);
                                    }
                                }, 1000); // Retry after 1 second
                            }
                        }
                    }
                });
            });

            // Add click event listeners to open the folder
            container.querySelectorAll('.folder-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    await api.openFileLocation(filePath);
                });
            });

            // Add click event listeners to export the clip
            container.querySelectorAll('.export-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const clipItem = button.parentElement;
                    const filePath = clipItem.getAttribute('data-file-path');
                    const fileName = filePath.split('\\').pop().split('/').pop(); // Extract filename from path
                    
                    // Open system file dialog for selecting export location
                    const result = await window.electronAPI.showSaveDialog({
                        defaultPath: fileName
                    });
                    
                    if (!result.canceled && result.filePath) {
                        try {
                            await api.exportFile(filePath, result.filePath);
                            ui.log(`Exported clip to: ${result.filePath}`);
                        } catch (error) {
                            console.error('Error exporting clip:', error);
                            ui.log(`Error exporting clip: ${error.message}`);
                        }
                    }
                });
            });

            // Add click event listeners to copy session ID
            container.querySelectorAll('.copy-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    const sessionId = button.getAttribute('data-session-id');
                    try {
                        await navigator.clipboard.writeText(sessionId);
                        button.classList.add('copied');
                        
                        // Reset button after 2 seconds
                        setTimeout(() => {
                            button.classList.remove('copied');
                        }, 2000);
                    } catch (error) {
                        console.error('Failed to copy session ID:', error);
                    }
                });
            });

        } catch (error) {
            console.error('Error loading montages:', error);
            container.innerHTML = '<p class="error-message">Error loading montages.</p>';
        }

        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.2s ease-in';
            container.style.opacity = '1';
        });
    },

    actions: (ui) => {
        const buttons = {
            connect: document.getElementById('connectOBSButton'),
            replay: document.getElementById('replayBufferButton'),
            montage: document.getElementById('generateMontageButton'),
            customMontage: document.getElementById('generateCustomMontageButton'),
            detection: document.getElementById('triggerDetectionButton'),
            validate: document.getElementById('validateClipsButton')
        };

        // Initialize button states
        Promise.all([
            api.isOBSConnected(),
            api.isReplayBufferActive(),
            api.isTriggerDetectionActive() // Add this new state check
        ]).then(([isConnected, isReplayActive, isDetectionActive]) => {
            if (buttons.connect) {
                buttons.connect.classList.toggle('connected', isConnected);
                buttons.connect.textContent = isConnected ? 'Disconnect from OBS' : 'Connect to OBS';
            }
            if (buttons.replay) {
                buttons.replay.classList.toggle('active', isReplayActive);
                buttons.replay.textContent = isReplayActive ? 'Stop Replay Buffer' : 'Start Replay Buffer';
            }
            if (buttons.detection) {
                buttons.detection.classList.toggle('active', isDetectionActive);
                buttons.detection.textContent = isDetectionActive ? 'Stop Trigger Detection' : 'Start Trigger Detection';
            }
        });

        // Add button event listeners
        if (buttons.connect) {
            buttons.connect.addEventListener('click', async () => {
                try {
                    if (buttons.connect.classList.contains('connected')) {
                        await api.disconnectOBS();
                        buttons.connect.textContent = 'Connect to OBS';
                        buttons.connect.classList.remove('connected');
                    } else {
                        await api.connectOBS();
                        buttons.connect.textContent = 'Disconnect from OBS';
                        buttons.connect.classList.add('connected');
                    }
                } catch (error) {
                    ui.log(`OBS connection error: ${error.message}`);
                }
            });
        }

        if (buttons.replay) {
            buttons.replay.addEventListener('click', async () => {
                try {
                    const isActive = buttons.replay.classList.contains('active');
                    if (isActive) {
                        await api.stopReplayBuffer();
                        buttons.replay.textContent = 'Start Replay Buffer';
                        buttons.replay.classList.remove('active');
                    } else {
                        await api.startReplayBuffer();
                        buttons.replay.textContent = 'Stop Replay Buffer';
                        buttons.replay.classList.add('active');
                    }
                } catch (error) {
                    ui.log(`Replay buffer error: ${error.message}`);
                }
            });
        }

        // Replace trigger detection handlers with single toggle button
        if (buttons.detection) {
            buttons.detection.addEventListener('click', async () => {
                try {
                    const isActive = buttons.detection.classList.contains('active');
                    if (isActive) {
                        await api.stopTriggerDetection();
                        buttons.detection.textContent = 'Start Trigger Detection';
                        buttons.detection.classList.remove('active');
                    } else {
                        await api.startTriggerDetection();
                        buttons.detection.textContent = 'Stop Trigger Detection';
                        buttons.detection.classList.add('active');
                    }
                } catch (error) {
                    ui.log(`Trigger detection error: ${error.message}`);
                }
            });
        }

        // Initialize trigger detection button states
        if (buttons.startDetection && buttons.stopDetection) {
            buttons.stopDetection.disabled = true; // Initially disable stop button
        }

        // Add montage button handler
        if (buttons.montage) {
            buttons.montage.addEventListener('click', async () => {
                try {
                    await api.generateMontage();
                    ui.log('Montage generation started');
                } catch (error) {
                    ui.log(`Error generating montage: ${error.message}`);
                }
            });
        }

        // Add custom montage button handler
        if (buttons.customMontage) {
            buttons.customMontage.addEventListener('click', async () => {
                const sessionInput = document.getElementById('sessionIdInput');
                const sessionId = sessionInput?.value.trim();
                
                if (!sessionId) {
                    ui.log('Please enter a session ID', 'warning');
                    return;
                }

                try {
                    await api.generateCustomMontage(sessionId);
                    ui.log(`Started montage generation for session: ${sessionId}`);
                } catch (error) {
                    ui.log(`Error generating montage: ${error.message}`, 'error');
                }
            });
        }

        if (buttons.validate) {
            buttons.validate.addEventListener('click', async () => {
                const sessionId = document.getElementById('sessionIdInput')?.value.trim();
                
                if (!sessionId) {
                    ui.log('Please enter a session ID in the input field above', 'warning');
                    return;
                }

                try {
                    const result = await api.validateSessionClips(sessionId);
                    if (result.success) {
                        ui.log(`Validation complete: ${result.validCount} valid clips, ${result.invalidCount} invalid clips removed`);
                        
                        // Log individual results if needed
                        if (result.failedPhotos.length > 0) {
                            result.failedPhotos.forEach(photo => {
                                ui.log(`Removed invalid clip for photo: ${photo.name}`, 'warning');
                            });
                        }
                    } else {
                        ui.log(`Validation failed: ${result.error}`, 'error');
                    }
                } catch (error) {
                    ui.log(`Validation error: ${error.message}`, 'error');
                }
            });
        }
    },

    validationPhotos: async (ui) => {
        const container = document.getElementById('validationPhotosContainer');
        const videoPlayerSection = document.getElementById('videoPlayerSection');
        if (!container || !videoPlayerSection) return;

        try {
            container.innerHTML = '<div class="spinner"></div>';
            
            const photos = await api.getValidationPhotos();
            console.log('Fetched validation photos:', photos);

            if (!photos || photos.length === 0) {
                container.innerHTML = '<p class="no-photos">No validation photos available.</p>';
                return;
            }

            // Store original video player content
            const originalVideoPlayer = videoPlayerSection.innerHTML;

            const photoElements = photos
                .map(photoPath => ({
                    path: photoPath,
                    time: new Date(photoPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/) 
                        ? photoPath.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)[1].replace(/_/g, ' ') 
                        : 0)
                }))
                .sort((a, b) => b.time - a.time)
                .map(({ path, time }) => `
                    <div class="photo-container" data-file-path="${path}">
                        <button class="delete-button" title="Delete Photo">
                            <img src="./assets/trash.png" alt="Delete">
                        </button>
                        <button class="folder-button" title="Open Folder">
                            <img src="./assets/folder.png" alt="Open Folder">
                        </button>
                        <img src="file://${path}" 
                             class="validation-photo" 
                             alt="Validation Photo"
                             loading="lazy"
                             onerror="this.onerror=null; this.src='./assets/error-image.png';">
                        <div class="photo-timestamp">${time.toLocaleString()}</div>
                    </div>
                `)
                .join('');

            container.innerHTML = photoElements;

            // Add click event listener for photo viewing
            container.querySelectorAll('.photo-container').forEach(photoContainer => {
                photoContainer.addEventListener('click', (event) => {
                    // Ignore clicks on buttons
                    if (event.target.closest('.delete-button') || event.target.closest('.folder-button')) {
                        return;
                    }

                    const filePath = photoContainer.getAttribute('data-file-path');
                    
                    // Replace video player with photo viewer
                    videoPlayerSection.innerHTML = `
                        <div class="photo-viewer">
                            <img src="file://${filePath}" alt="Full size photo" class="full-size-photo">
                            <button class="close-photo-viewer">×</button>
                        </div>
                    `;

                    // Add close button handler
                    const closeButton = videoPlayerSection.querySelector('.close-photo-viewer');
                    if (closeButton) {
                        closeButton.addEventListener('click', () => {
                            videoPlayerSection.innerHTML = originalVideoPlayer;
                        });
                    }
                });
            });

            // Add click event listeners to delete the photo
            container.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const photoItem = button.parentElement;
                    const filePath = photoItem.getAttribute('data-file-path');
                    if (confirm(`Are you sure you want to delete this photo?`)) {
                        try {
                            await api.deleteClip(filePath); // Reuse deleteClip for photos
                            photoItem.remove();
                            ui.log(`Deleted photo: ${filePath}`);
                        } catch (error) {
                            console.error('Error deleting photo:', error);
                            ui.log(`Error deleting photo: ${error.message}`);
                            if (error.message.includes('EBUSY')) {
                                setTimeout(async () => {
                                    try {
                                        await api.deleteClip(filePath);
                                        photoItem.remove();
                                        ui.log(`Deleted photo after retry: ${filePath}`);
                                    } catch (retryError) {
                                        console.error('Retry error deleting photo:', retryError);
                                        ui.log(`Retry error deleting photo: ${retryError.message}`);
                                    }
                                }, 1000); // Retry after 1 second
                            }
                        }
                    }
                });
            });

            // Add click event listeners to open the folder
            container.querySelectorAll('.folder-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation(); // Prevent triggering other events
                    const photoItem = button.parentElement;
                    const filePath = photoItem.getAttribute('data-file-path');
                    await api.openFileLocation(filePath);
                });
            });

        } catch (error) {
            console.error('Error loading validation photos:', error);
            container.innerHTML = '<p class="error-message">Error loading validation photos.</p>';
        }
    },

    audio: async (ui) => {
        try {
            const searchInput = document.getElementById('searchInput');
            const searchButton = document.getElementById('searchButton');
            const audioResults = document.getElementById('audioResults');

            if (!searchInput || !searchButton || !audioResults) {
                throw new Error('Audio section elements not found');
            }

            // Add search button click handler
            searchButton.addEventListener('click', async () => {
                const query = searchInput.value.trim();
                if (!query) {
                    alert('Please enter a search term.');
                    return;
                }

                ui.log('Fetching audio samples...');
                audioResults.innerHTML = '<div class="spinner"></div>';

                try {
                    console.log('Making API call with query:', query);
                    const response = await api.searchAudioSamples(query);
                    console.log('API Response:', response);

                    if (!response || !response.results) {
                        console.error('Invalid response format:', response);
                        audioResults.innerHTML = '<p>Error: Invalid response from server</p>';
                        return;
                    }

                    if (response.results.length === 0) {
                        audioResults.innerHTML = '<p>No results found.</p>';
                        return;
                    }

                    console.log('Fetching detailed samples...');
                    const detailedSamples = await Promise.all(
                        response.results.map(sample => {
                            console.log('Fetching details for sample:', sample.id);
                            return api.getAudioDetails(sample.id);
                        })
                    );

                    ui.populateAudioResults(detailedSamples.filter(Boolean));
                } catch (error) {
                    console.error('Search error:', error);
                    ui.log(`Error searching audio: ${error.message}`);
                    audioResults.innerHTML = '<p>Error searching for audio samples.</p>';
                }
            });

            // Add enter key handler for search
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    searchButton.click();
                }
            });
        } catch (error) {
            console.error('Audio section initialization error:', error);
            ui.log(`Error initializing audio section: ${error.message}`);
        }
    },

    edit: async (ui) => {
        try {
            // Initialize edit mode when entering the section
            await ui.toggleEditMode(true);
            await ui.loadMostRecentSession(); // Load clips from the most recent session
        } catch (error) {
            console.error('Error initializing edit mode:', error);
            ui.log('Failed to initialize edit mode', 'error');
        }
    },

    settings: (ui) => {
        // Replace with a handler to open settings window
        window.electronAPI.openSettings();
    }
};

// Helper function for button state management
function updateButtonState(button, isActive, inactiveText, activeText) {
    if (!button) return;
    button.textContent = isActive ? activeText : inactiveText;
    button.classList.toggle('active', isActive);
}

// Single export statement for all items
export { updateButtonState };
