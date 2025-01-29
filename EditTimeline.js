import Sortable from '../../../node_modules/sortablejs/modular/sortable.esm.js';

// Update the createVideoUrl helper at the top
function createVideoUrl(clipId) {
    // For browser preview
    return window.electronAPI.getClipUrl(clipId);
}

async function simplifyMontageSettings() {
    const config = await window.electronAPI.readConfigFile();
    const editorSettings = config?.montage?.editorSettings || {};
    const outroPath = config.montage?.outroPath || 'assets/videoAssets/Game-Play.mp4';
    
    return {
        clipVolume: (editorSettings.clipVolume ?? 70) / 100,
        musicVolume: (editorSettings.musicVolume ?? 30) / 100,
        selectedMusic: editorSettings.selectedMusic || null,
        outroPath: outroPath
    };
}

export class EditTimeline {
    constructor(container, callbacks) {
        this.container = container;
        this.clips = [];
        this.callbacks = callbacks;
        this.timelineElement = null;
        this.defaultSettings = {
            clipVolume: 70,
            musicVolume: 30,
            selectedMusic: '',
            transitionType: 'cut'
        };
    }

    async initialize() {
        this.timelineElement = document.getElementById('editTimelineContainer');
        if (!this.timelineElement) return;

        // Load saved editor settings first
        await this.loadEditorSettings();

        // Render the initial template
        this.timelineElement.innerHTML = `
            <div class="editing-timeline">
                <div class="timeline-preview">
                    <video id="timelinePreview" class="preview-player" controls>
                        Your browser does not support video playback.
                    </video>
                </div>
                <div class="timeline-controls">
                    <div class="session-controls">
                        <select id="sessionSelect" class="timeline-select">
                            <option value="" selected>Select a Session</option>
                        </select>
                    </div>
                    <div class="music-select-container">
                        <select id="audioSelect" class="timeline-select">
                            <option value="" selected>Background Music</option>
                        </select>
                        <button class="preview-button" id="audioPreviewButton">
                            <img src="./assets/play.png" alt="Play" class="preview-icon">
                            <span class="preview-text"></span>
                        </button>
                        <audio id="audioPreviewPlayer" preload="none"></audio>
                    </div>
                     <div class="volume-controls">
                        <div class="volume-slider">
                            <label for="clipVolume">Clip Volume</label>
                            <input type="range" id="clipVolume" min="0" max="100" value="70">
                            <span class="volume-value">70%</span>
                        </div>
                        <div class="volume-slider">
                            <label for="musicVolume">Music Volume</label>
                            <input type="range" id="musicVolume" min="0" max="100" value="30">
                            <span class="volume-value">30%</span>
                        </div>
                    </div>
                    <div class="timeline-actions">
                        <button id="reloadTimelineBtn" class="timeline-btn">
                            <img src="./assets/reload.png" alt="Reload" class="action-icon">
                        </button>
                        <button id="previewMontageBtn" class="timeline-btn">Preview</button>
                        <button id="saveMontageBtn" class="timeline-btn">Generate Montage</button>
                    </div>
                </div>
                <div class="timeline-clips" id="timelineClips"></div>
            </div>
        `;

        // Initialize all components in parallel
        await Promise.all([
            this.loadSessions(),  // Add this new call
            this.loadAudioFiles(),
            this.initializeSortable(),
            this.initializeEventListeners()
        ]);
    }

    async loadEditorSettings() {
        try {
            // Get the full config
            const config = await window.electronAPI.readConfigFile();
            const editorSettings = config?.montage?.editorSettings;
            
            if (!editorSettings) {
                console.warn('No editor settings found in config, using defaults');
                return this.defaultSettings;
            }

            // Get UI elements
            const clipVolume = document.getElementById('clipVolume');
            const musicVolume = document.getElementById('musicVolume');
            const clipVolumeDisplay = clipVolume?.nextElementSibling;
            const musicVolumeDisplay = musicVolume?.nextElementSibling;
            const audioSelect = document.getElementById('audioSelect');

            // Initialize volume controls with values from config
            if (clipVolume && clipVolumeDisplay) {
                const savedVolume = editorSettings.clipVolume;
                clipVolume.value = savedVolume;
                clipVolumeDisplay.textContent = `${savedVolume}%`;
                // Update any video elements
                document.querySelectorAll('video').forEach(video => {
                    video.volume = savedVolume / 100;
                });
            }

            if (musicVolume && musicVolumeDisplay) {
                const savedVolume = editorSettings.musicVolume;
                musicVolume.value = savedVolume;
                musicVolumeDisplay.textContent = `${savedVolume}%`;
                // Update any audio elements
                document.querySelectorAll('audio').forEach(audio => {
                    audio.volume = savedVolume / 100;
                });
            }

            // Initialize audio selection
            if (audioSelect && editorSettings.selectedMusic) {
                // We need to load audio files first to populate the select

                await this.loadAudioFiles();

                // Set the selected music from editorSettings
                audioSelect.value = editorSettings.selectedMusic;

                // If selection failed, log warning
                if (audioSelect.value !== editorSettings.selectedMusic) {
                    console.warn('Failed to set music selection:', editorSettings.selectedMusic);
                }
            }

            console.log('Editor settings loaded and applied:', editorSettings);
            return editorSettings;

        } catch (error) {
            console.error('Error loading editor settings:', error);
            return this.defaultSettings;
        }
    }

    async saveEditorSettings() {
        try {
            const clipVolume = document.getElementById('clipVolume');
            const musicVolume = document.getElementById('musicVolume');
            const audioSelect = document.getElementById('audioSelect');

            // Read existing config first
            const config = await window.electronAPI.readConfigFile();
            
            // Create new editor settings
            const editorSettings = {
                clipVolume: parseInt(clipVolume?.value || 70),
                musicVolume: parseInt(musicVolume?.value || 30),
                selectedMusic: audioSelect?.value || "",
                transitionType: "cut",
                lastSessionId: this.activeSession
            };

            // Create new config preserving all existing settings
            const newConfig = {
                ...config,
                obs: {
                    ...config.obs
                },
                montage: {
                    ...config.montage,
                    editorSettings: {
                        ...config.montage?.editorSettings,
                        ...editorSettings
                    }
                }
            };

            await window.electronAPI.saveConfigFile(newConfig);
            console.log('Editor settings saved:', editorSettings);

            return true;
        } catch (error) {
            console.error('Error saving editor settings:', error);
            return false;
        }
    }

    // Add this new method
    async initializeSortable() {
        const timelineClips = document.getElementById('timelineClips');
        if (!timelineClips) return;

        this.sortable = new Sortable(timelineClips, {
            animation: 150,
            ghostClass: 'timeline-clip-ghost',
            onEnd: () => {
                this.updateClipsOrder();
                this.callbacks.onClipsChange?.(this.clips);
            }
        });
    }

    // Add this new method to load sessions
    async loadSessions() {
        try {
            const sessions = await window.electronAPI.readConfigFile();
            const sessionSelect = document.getElementById('sessionSelect');
            if (!sessionSelect || !sessions?.sessions) return;

            // Clear and add default option
            sessionSelect.innerHTML = '<option value="" disabled selected>Select a Session</option>';
            
            // Add "Recent Session" option first
            const option = document.createElement('option');
            option.value = "recent";
            option.textContent = "Recent Session";
            sessionSelect.appendChild(option);

            // Add divider
            const divider = document.createElement('option');
            divider.disabled = true;
            divider.textContent = "──────────";
            sessionSelect.appendChild(divider);

            // Add session options sorted by start time (most recent first)
            sessions.sessions
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                .forEach(session => {
                    const option = document.createElement('option');
                    option.value = session.id;
                    option.textContent = `Session ${session.id} (${session.startTime}${session.endTime ? ` - ${session.endTime}` : ' - Active'})`;
                    sessionSelect.appendChild(option);
                });

            // Add change event listener
            sessionSelect.addEventListener('change', (e) => {
                const sessionId = e.target.value;
                if (sessionId === 'recent') {
                    this.loadMostRecentSession();
                } else if (sessionId) {
                    this.loadSessionClips(sessionId);
                }
            });

        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    initializeEventListeners() {
        const reloadBtn = document.getElementById('reloadTimelineBtn');
        const videoPlayer = document.getElementById('editVideoPlayer');
        const bgmPlayer = document.createElement('audio');
        const previewBtn = document.getElementById('previewMontageBtn');
        const audioSelect = document.getElementById('audioSelect');
        
        let isPlaying = false;
        let isPaused = false;
        let currentIndex = 0;

        // Initialize background music player
        bgmPlayer.loop = true;
        bgmPlayer.volume = (document.getElementById('musicVolume')?.value || 30) / 100;

        const playNextClip = async () => {
            if (currentIndex <= this.clips.length) {
                try {
                    let videoUrl;
                    if (currentIndex === this.clips.length) {
                        // Get outro path from config
                        const config = await window.electronAPI.readConfigFile();
                        const outroPath = config.montage?.outroPath || 'assets/videoAssets/Game-Play.mp4';
                        videoUrl = await createVideoUrl(outroPath);
                        
                        // Debug outro path resolution
                        console.log('Loading outro video:', {
                            outroPath,
                            videoUrl
                        });
                    } else {
                        videoUrl = await createVideoUrl(this.clips[currentIndex].id);
                    }

                    if (!videoUrl) {
                        throw new Error(`Failed to get video URL for ${currentIndex === this.clips.length ? 'outro' : 'clip'}`);
                    }

                    videoPlayer.src = videoUrl;
                    videoPlayer.load();

                    // Start or restart background music on first clip only
                    if (currentIndex === 0) {
                        const selectedMusic = audioSelect.value;
                        if (selectedMusic) {
                            bgmPlayer.src = `assets/audioAssets/${selectedMusic}`;
                            bgmPlayer.currentTime = 0;
                            await bgmPlayer.play();
                        }
                    }

                    await videoPlayer.play();
                    currentIndex++;
                } catch (error) {
                    console.error('Error in playNextClip:', error);
                    if (currentIndex < this.clips.length) {
                        // Only auto-advance if we're not at the outro
                        currentIndex++;
                        playNextClip();
                    } else {
                        // Reset playback if outro fails
                        currentIndex = 0;
                        bgmPlayer.pause();
                        bgmPlayer.currentTime = 0;
                        updatePreviewButton('start');
                        isPlaying = false;
                        isPaused = false;
                    }
                }
            } else {
                // Reset playback
                currentIndex = 0;
                bgmPlayer.pause();
                bgmPlayer.currentTime = 0;
                updatePreviewButton('start');
                isPlaying = false;
                isPaused = false;
            }
        };

        const updatePreviewButton = (state) => {
            if (!previewBtn) return;

            switch (state) {
                case 'start':
                    previewBtn.innerHTML = `
                        <div class="preview-button-content">
                            <img src="./assets/playEdit.png" alt="Play" class="preview-icon">
                            <span class="preview-text">Preview</span>
                        </div>
                    `;
                    previewBtn.classList.remove('playing');
                    break;
                case 'pause':
                    previewBtn.innerHTML = `
                        <div class="preview-button-content">
                            <img src="./assets/pauseEdit.png" alt="Pause" class="preview-icon">
                            <span class="preview-text">Pause</span>
                        </div>
                    `;
                    previewBtn.classList.add('playing');
                    break;
                case 'resume':
                    previewBtn.innerHTML = `
                        <div class="preview-button-content">
                            <img src="./assets/playEdit.png" alt="Resume" class="preview-icon">
                            <span class="preview-text">Resume</span>
                        </div>
                    `;
                    previewBtn.classList.remove('playing');
                    break;
            }
        };

        // Reload button handler
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                currentIndex = 0;
                isPlaying = false;
                isPaused = false;
                if (videoPlayer.src) {
                    videoPlayer.pause();
                    videoPlayer.currentTime = 0;
                }
                if (bgmPlayer.src) {
                    bgmPlayer.pause();
                    bgmPlayer.currentTime = 0;
                }
                updatePreviewButton('start');
            });
        }

        // Preview button handler
        previewBtn.addEventListener('click', () => {
            if (!isPlaying && !isPaused) {
                // First click, start preview
                updatePreviewButton('pause');
                isPlaying = true;
                isPaused = false;
                playNextClip();
            } else if (isPlaying && !isPaused) {
                // Pause playback
                updatePreviewButton('resume');
                isPlaying = true;
                isPaused = true;
                videoPlayer.pause();
                bgmPlayer.pause();
            } else if (isPlaying && isPaused) {
                // Resume playback
                updatePreviewButton('pause');
                isPaused = false;
                videoPlayer.play().catch(console.error);
                bgmPlayer.play().catch(console.error);
            }
        });

        // Video ended handler
        videoPlayer.addEventListener('ended', () => {
            if (isPlaying && !isPaused) {
                playNextClip();
            }
        });

        // Audio preview functionality
        const audioPreviewButton = document.getElementById('audioPreviewButton');
        const audioPreviewPlayer = document.getElementById('audioPreviewPlayer');

        if (audioPreviewButton && audioPreviewPlayer) {
            audioPreviewButton.addEventListener('click', () => {
                const selectedOption = audioSelect.selectedOptions[0];
                if (!selectedOption?.value) return;

                if (audioPreviewPlayer.paused) {
                    audioPreviewPlayer.src = `assets/audioAssets/${selectedOption.value}`;
                    audioPreviewPlayer.volume = 0.3;
                    audioPreviewPlayer.play()
                        .then(() => {
                            audioPreviewButton.classList.add('playing');
                            const icon = audioPreviewButton.querySelector('.preview-icon');
                            if (icon) icon.src = './assets/stop.png';
                        })
                        .catch(err => console.log('Preview playback error:', err));
                } else {
                    audioPreviewPlayer.pause();
                    audioPreviewPlayer.currentTime = 0;
                    audioPreviewButton.classList.remove('playing');
                    const icon = audioPreviewButton.querySelector('.preview-icon');
                    if (icon) icon.src = './assets/play.png';
                }
            });

            // Add other event listeners...
            // ...existing code for other audio preview event listeners...
        }

        // Add volume control handlers
        const clipVolume = document.getElementById('clipVolume');
        const musicVolume = document.getElementById('musicVolume');
        const clipVolumeValue = clipVolume.nextElementSibling;
        const musicVolumeValue = musicVolume.nextElementSibling;

        clipVolume.addEventListener('input', (e) => {
            const value = e.target.value;
            clipVolumeValue.textContent = `${value}%`;
            if (videoPlayer) {
                videoPlayer.volume = value / 100;
            }
        });

        musicVolume.addEventListener('input', (e) => {
            const value = e.target.value;
            musicVolumeValue.textContent = `${value}%`;
            if (bgmPlayer) {
                bgmPlayer.volume = value / 100;
            }
        });

        // Add generate montage button handler
        const saveMontageBtn = document.getElementById('saveMontageBtn');
        if (saveMontageBtn) {
            saveMontageBtn.addEventListener('click', async () => {
                try {
                    if (!this.clips.length) {
                        throw new Error('No clips selected for montage');
                    }

                    // Get current editor settings from config
                    const config = await window.electronAPI.readConfigFile();
                    
                    // Use default settings if none found in config
                    const editorSettings = config?.montage?.editorSettings || {
                        clipVolume: 70,    // Default clip volume
                        musicVolume: 30,    // Default music volume
                        selectedMusic: null // No music by default
                    };

                    const settings = {
                        clips: this.clips.map(clip => clip.id),
                        audioFile: editorSettings.selectedMusic,
                        // Convert percentages to decimals with defaults if missing
                        clipVolume: (editorSettings.clipVolume ?? 70) / 100,
                        musicVolume: (editorSettings.musicVolume ?? 30) / 100,
                        outputFileName: `montage_${Date.now()}.mp4`
                    };

                    console.log('Using editor settings:', editorSettings);
                    console.log('Generated montage settings:', settings);

                    await this.callbacks.onSave?.(settings);
                } catch (error) {
                    console.error('Montage generation error:', error);
                }
            });
        }

        // Add volume control handlers with settings persistence
        if (clipVolume) {
            clipVolume.addEventListener('change', () => {
                this.saveEditorSettings();
            });
        }

        if (musicVolume) {
            musicVolume.addEventListener('change', () => {
                this.saveEditorSettings();
            });
        }

        if (audioSelect) {
            audioSelect.addEventListener('change', () => {
                this.saveEditorSettings();
            });
        }
    }

    async loadSessionClips(sessionId) {
        try {
            const clips = await window.electronAPI.getClipList();
            
            // Filter clips for the specified session and sort by number
            const sessionClips = clips
                .filter(clip => clip.startsWith(sessionId))
                .map(clip => ({
                    id: clip,
                    number: parseInt(clip.split('_').pop()) || 0
                }))
                .sort((a, b) => a.number - b.number);

            if (sessionClips.length === 0) {
                console.warn(`No clips found for session: ${sessionId}`);
                return;
            }

            // Update the active session and clips
            this.activeSession = sessionId;
            this.clips = sessionClips;

            // Render the new clips
            await this.renderClips();
            console.log(`Loaded ${sessionClips.length} clips from session ${sessionId}`);
        } catch (error) {
            console.error('Error loading session clips:', error);
        }
    }

    async loadAudioFiles() {
        try {
            const audioSelect = document.getElementById('audioSelect');
            if (!audioSelect) return;

            // Get both audio files and config
            const [audioFiles, config] = await Promise.all([
                window.electronAPI.getAudioFiles(),
                window.electronAPI.readConfigFile()
            ]);
            
            // Get the selected music from editorSettings
            const selectedMusic = config?.montage?.editorSettings?.selectedMusic;

            // Clear and initialize select
            audioSelect.innerHTML = '<option value="">Select Background Music</option>';

            // Add audio files to select
            if (audioFiles?.length > 0) {
                audioFiles.sort((a, b) => a.localeCompare(b)).forEach(file => {
                    const option = document.createElement('option');
                    option.value = file;
                    option.textContent = file.replace(/\.mp3$/, '')
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    
                    // Set selected if matches config
                    if (file === selectedMusic) {
                        option.selected = true;
                    }
                    
                    audioSelect.appendChild(option);
                });
            }

        } catch (error) {
            console.error('Error loading audio files:', error);
        }
    }

    async loadClips() {
        try {
            const clips = await window.electronAPI.getClipList();
            
            // Group clips by session ID
            const sessions = {};
            clips.forEach(clip => {
                // Skip montage files
                if (clip.startsWith('montage_')) return;
                
                const sessionId = clip.split('_')[0];
                if (!sessionId) return;
                
                if (!sessions[sessionId]) {
                    sessions[sessionId] = [];
                }
                sessions[sessionId].push({
                    id: clip,
                    number: parseInt(clip.split('__').pop()) || 0
                });
            });

            // Get most recent session's clips by default
            const recentSession = Object.entries(sessions)
                .sort((a, b) => {
                    const timestampA = Math.max(...a[1].map(clip => 
                        new Date(clip.id.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)?.[1].replace(/_/g, ' ')).getTime()
                    ));
                    const timestampB = Math.max(...b[1].map(clip => 
                        new Date(clip.id.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)?.[1].replace(/_/g, ' ')).getTime()
                    ));
                    return timestampB - timestampA;
                })[0];

            if (!recentSession) {
                console.warn('No sessions found');
                return;
            }

            const [sessionId, sessionClips] = recentSession;
            this.activeSession = sessionId;

            // Sort clips by their number
            this.clips = sessionClips
                .sort((a, b) => a.number - b.number)
                .map(clip => ({
                    id: clip.id,
                    number: clip.number
                }));

            await this.renderClips();
            
            // Update session ID input if it exists
            const sessionInput = document.getElementById('editSessionId');
            if (sessionInput) {
                sessionInput.value = sessionId;
            }

        } catch (error) {
            console.error('Error loading clips:', error);
        }
    }

    async renderClips() {
        const timelineClips = document.getElementById('timelineClips');
        const timelinePreview = document.getElementById('timelinePreview');
        if (!timelineClips || !this.clips.length) return;

        console.log('Rendering clips:', this.clips);
        timelineClips.innerHTML = '';

        // Render user clips first
        for (const clip of this.clips) {
            const clipUrl = await createVideoUrl(clip.id);
            if (!clipUrl) {
                console.error('Failed to get URL for clip:', clip.id);
                continue;
            }

            const clipElement = document.createElement('div');
            clipElement.className = 'timeline-clip';
            clipElement.dataset.clipId = clip.id;

            const videoElement = document.createElement('video');
            videoElement.src = clipUrl;
            videoElement.preload = 'metadata';
            videoElement.muted = true;
            
            // Add error handler
            videoElement.onerror = () => {
                console.error('Error loading video:', clipUrl, videoElement.error);
            };
            
            clipElement.appendChild(videoElement);
            clipElement.innerHTML += `
                <button class="remove-clip" title="Remove from timeline">×</button>
                <div class="clip-info">Clip ${clip.number}</div>
            `;

            timelineClips.appendChild(clipElement);
        }

        // Add outro with error handling
        try {
            console.log('Adding outro video...');
            const outroUrl = await createVideoUrl('assets/videoAssets/Game-Play.mp4');
            
            if (!outroUrl) {
                throw new Error('Failed to get URL for outro video');
            }

            const outroElement = document.createElement('div');
            outroElement.className = 'timeline-clip outro-clip';
            
            const outroVideo = document.createElement('video');
            outroVideo.src = outroUrl;
            outroVideo.preload = 'metadata';
            outroVideo.muted = true;
            
            outroVideo.onerror = (e) => {
                console.error('Outro video error:', {
                    error: outroVideo.error,
                    src: outroUrl,
                    event: e
                });
            };

            outroElement.appendChild(outroVideo);
            outroElement.innerHTML += `
                <div class="clip-info">Outro</div>
                <div class="outro-badge">Auto-Added</div>
            `;

            timelineClips.appendChild(outroElement);
            console.log('Outro element added with URL:', outroUrl);
        } catch (error) {
            console.error('Error adding outro:', error);
        }

        // Set preview with full path
        if (timelinePreview && this.clips.length > 0) {
            const firstClipUrl = await createVideoUrl(this.clips[0].id);
            timelinePreview.src = firstClipUrl;
            timelinePreview.poster = `${firstClipUrl}#t=0.5`;
            timelinePreview.load();
        }

        this.addClipEventHandlers();
    }

    async playClip(clipId) {
        const videoPlayer = document.getElementById('editVideoPlayer');
        if (!videoPlayer) {
            console.error('Video player element not found');
            return;
        }

        try {
            const videoUrl = createVideoUrl(clipId);
            console.log('Playing clip:', videoUrl); // Debug log

            videoPlayer.src = videoUrl;
            videoPlayer.load();
            await videoPlayer.play();
        } catch (error) {
            console.error('Error playing clip:', error);
        }
    }

    addClipEventHandlers() {
        const timelineClips = document.getElementById('timelineClips');
        if (!timelineClips) return;

        // Add handlers for remove buttons only
        timelineClips.querySelectorAll('.remove-clip').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipElement = e.target.closest('.timeline-clip');
                if (clipElement) {
                    const clipId = clipElement.dataset.clipId;
                    this.removeClip(clipId);
                }
            });
        });

        // Add hover preview for thumbnails with muted audio
        timelineClips.querySelectorAll('.timeline-clip video').forEach(video => {
            const clip = video.closest('.timeline-clip');
            if (clip) {
                clip.addEventListener('mouseenter', () => {
                    video.muted = true; // Ensure video is muted during hover preview
                    if (video.paused) {
                        video.currentTime = 0;
                        video.play().catch(() => {});
                    }
                });
                
                clip.addEventListener('mouseleave', () => {
                    if (!video.paused) {
                        video.pause();
                        video.currentTime = 0;
                    }
                });
            }
        });
    }

    removeClip(clipId) {
        this.clips = this.clips.filter(clip => clip.id !== clipId);
        this.renderClips(); // Just re-render instead of reloading
        this.callbacks.onClipsChange?.(this.clips);
    }

    updateClipsOrder() {
        const timelineClips = document.getElementById('timelineClips');
        if (!timelineClips) return;

        const newOrder = [...timelineClips.querySelectorAll('.timeline-clip')]
            .map(element => {
                const clipId = element.dataset.clipId;
                return this.clips.find(clip => clip.id === clipId);
            })
            .filter(Boolean);

        this.clips = newOrder;
    }

    show() {
        const timeline = this.timelineElement?.querySelector('.editing-timeline');
        timeline?.classList.add('visible');
    }

    hide() {
        const timeline = this.timelineElement?.querySelector('.editing-timeline');
        timeline?.classList.remove('visible');
    }

    async loadMostRecentSession() {
        try {
            // Add flag to prevent multiple loads
            if (this._loadingSession) return;
            this._loadingSession = true;

            const [clips, sessions] = await Promise.all([
                window.electronAPI.getClipList(),
                window.electronAPI.readConfigFile()
            ]);
            
            if (!sessions?.sessions?.length) {
                console.warn('No sessions found in sessions.json');
                return;
            }

            // Find the most recent session
            const mostRecentSession = sessions.sessions
                .map(session => ({
                    ...session,
                    timestamp: new Date(session.startTime).getTime()
                }))
                .sort((a, b) => b.timestamp - a.timestamp)[0];

            if (!mostRecentSession) {
                console.warn('Could not determine most recent session');
                return;
            }

            // Filter and sort clips for this session
            const sessionClips = clips
                .filter(clip => clip.startsWith(mostRecentSession.id) && !clip.startsWith('montage_'))
                .map(clip => ({
                    id: clip,
                    number: parseInt(clip.split('_').pop()) || 0
                }))
                .sort((a, b) => a.number - b.number);

            // Update the timeline's clips
            this.clips = sessionClips;

            // Render the clips in the timeline
            await this.renderClips();

            // Update session ID input
            const sessionInput = document.getElementById('editSessionId');
            if (sessionInput) {
                sessionInput.value = mostRecentSession.id;
            }

            console.log(`Loaded most recent session: ${mostRecentSession.id} from ${mostRecentSession.startTime}`);
            console.log('Loaded clips:', this.clips);

        } catch (error) {
            console.error('Error loading most recent session:', error);
        } finally {
            this._loadingSession = false;
        }
    }

    async saveMontageChanges() {
        try {
            if (!this.clips.length) {
                throw new Error('No clips selected for montage');
            }

            const config = await window.electronAPI.readConfigFile();
            const outroPath = config.montage?.outroPath || 'assets/videoAssets/Game-Play.mp4';
            const editorSettings = config.montage?.editorSettings || {};

            // Send the montage configuration
            const montageConfig = {
                clips: [
                    ...this.clips.map(clip => clip.id),
                    outroPath // Explicitly add outro path
                ],
                audioFile: editorSettings.selectedMusic,
                clipVolume: (editorSettings.clipVolume ?? 70) / 100,
                musicVolume: (editorSettings.musicVolume ?? 30) / 100,
                outputFileName: `montage_${Date.now()}.mp4`,
                // Add explicit outro path reference
                outroPath
            };

            console.log('Sending montage config:', montageConfig);
            // Log specific settings for debugging
            console.log('Clips to process:', montageConfig.clips);
            console.log('Outro path:', outroPath);

            const result = await this.callbacks.onSave?.(montageConfig);
            
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to generate montage');
            }

            return result;
        } catch (error) {
            console.error('Error in saveMontageChanges:', error);
            throw error;
        }
    }
}
