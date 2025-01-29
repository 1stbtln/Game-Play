import { api } from './api.js';
import { sections, sectionHandlers } from './sections.js';
import { EditTimeline } from './components/EditTimeline.js';  // Add this import

class UI {
    constructor() {
        this.dynamicContent = null;
        this.currentAudioPlayer = null;
        this.initialized = false;
        this.currentSection = null;
        this.initializePromise = null;
        this.lastLogs = new Map(); // Store last log of each type
        this.logCooldowns = new Map(); // Store cooldown timers
        this.LOG_COOLDOWN = 2000; // 2 seconds cooldown
        this.editMode = false;
        this.editTimeline = null;
        this.activeSession = null;
    }

    async initialize() {
        // Prevent multiple initializations
        if (this.initializePromise) {
            return this.initializePromise;
        }

        this.initializePromise = (async () => {
            try {
                // Ensure DOM is ready
                if (document.readyState === 'loading') {
                    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
                }

                // Get dynamic content container with error handling
                this.dynamicContent = document.querySelector('.primarySection');
                if (!this.dynamicContent) {
                    throw new Error('Dynamic content container (.primarySection) not found. Please check your HTML structure.');
                }

                // Initialize navigation
                await this.initializeEventListeners();
                this.initialized = true;

                // Load default section
                await this.updateContent('clips');
                
                // Initialize edit timeline
                await this.initializeEditMode();
                
                return true;
            } catch (error) {
                console.error('UI initialization failed:', error);
                this.showErrorMessage(error.message);
                throw error;
            }
        })();

        return this.initializePromise;
    }

    async initializeEditMode() {
        try {
            const primarySection = document.querySelector('.primarySection');
            if (!primarySection) {
                throw new Error('Primary section not found');
            }

            this.editTimeline = new EditTimeline(primarySection, {
                onClipsChange: (clips) => this.handleClipsChange(clips),
                onPreview: (clips) => this.previewMontage(clips),
                onSave: (clips) => this.saveMontageChanges(clips)
            });

            await this.editTimeline.initialize();
            await this.editTimeline.loadMostRecentSession(); // Directly load most recent session
            
            // Initialize controls after loading clips
            this.initializeEditControls();
            
            // Set Recent Session button as active
            const loadRecentBtn = document.getElementById('loadRecentSession');
            if (loadRecentBtn) {
                loadRecentBtn.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to initialize edit mode:', error);
        }
    }

    async toggleEditMode(enabled) {
        if (!this.editTimeline) {
            console.error('Edit timeline not initialized');
            return;
        }

        this.editMode = enabled;
        document.body.classList.toggle('edit-mode', enabled);

        const mainSection = document.querySelector('.mainSection');
        const mainEditSection = document.querySelector('.mainEditSection');

        if (enabled) {
            if (mainSection) mainSection.style.display = 'none';
            if (mainEditSection) mainEditSection.style.display = 'flex';

            // Initialize and load most recent session clips
            await this.editTimeline.initialize();
            await this.editTimeline.loadMostRecentSession();
            
            this.editTimeline.show();
        } else {
            if (mainSection) mainSection.style.display = 'flex';
            if (mainEditSection) mainEditSection.style.display = 'none';
            
            this.editTimeline.hide();
        }
    }

    initializeEditControls() {
        const loadRecentBtn = document.getElementById('loadRecentSession');
        const loadCustomBtn = document.getElementById('loadCustomSession');
        const sessionInput = document.getElementById('editSessionId');
        const previewBtn = document.getElementById('previewMontage');
        const saveBtn = document.getElementById('saveMontage');

        if (loadRecentBtn && loadCustomBtn && sessionInput) {
            loadRecentBtn.addEventListener('click', () => {
                loadRecentBtn.classList.add('active');
                loadCustomBtn.classList.remove('active');
                this.loadMostRecentSession();
            });

            loadCustomBtn.addEventListener('click', () => {
                const sessionId = sessionInput.value.trim();
                if (!sessionId) {
                    this.log('Please enter a session ID', 'warning');
                    return;
                }
                loadRecentBtn.classList.remove('active');
                loadCustomBtn.classList.add('active');
                this.loadTimelineClips(sessionId);
            });
        }

        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.previewMontage(this.editTimeline.clips);
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveMontageChanges(this.editTimeline.clips);
            });
        }
    }

    async loadMostRecentSession() {
        if (!this.editTimeline) {
            console.error('Edit timeline not initialized');
            return;
        }

        try {
            // Wait for the timeline to load the most recent session
            await this.editTimeline.loadMostRecentSession();
        } catch (error) {
            console.error('Error loading most recent session:', error);
            this.log('Error loading session clips', 'error');
        }
    }

    async loadTimelineClips() {
        try {
            const clips = await api.getClipList();
            
            // Filter clips to only get actual clips (not montages)
            const sessionClips = clips
                .filter(clip => !clip.startsWith('montage_'))
                .sort((a, b) => {
                    const timeA = a.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)?.[1] || '';
                    const timeB = b.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/)?.[1] || '';
                    return timeB.localeCompare(timeA); // Sort newest first
                });

            if (sessionClips.length === 0) {
                this.log('No clips found', 'warning');
                return;
            }

            // Prepare clip data for timeline
            const clipData = sessionClips.map(clip => ({
                id: clip,
                thumbnail: `clips/${clip}`, // Updated path
                path: `clips/${clip}` // Updated path
            }));

            // Load clips into timeline
            await this.editTimeline.loadClips(clipData);
            
            this.log(`Loaded ${clipData.length} clips into timeline`);
        } catch (error) {
            console.error('Error loading timeline clips:', error);
            this.log('Error loading clips for editing', 'error');
        }
    }

    async handleClipsChange(clips) {
        // Handle clip order/content changes
        this.log(`Timeline updated: ${clips.length} clips`);
    }

    async previewMontage(clips) {
        try {
            const videoPlayer = document.getElementById('timelinePreview');
            if (!videoPlayer || clips.length === 0) return;

            // Update video source and play
            videoPlayer.src = `clips/${clips[0].id}`;
            await videoPlayer.play();

            // Set up playlist behavior
            let currentIndex = 0;
            videoPlayer.addEventListener('ended', () => {
                currentIndex++;
                if (currentIndex < clips.length) {
                    videoPlayer.src = `clips/${clips[currentIndex].id}`;
                    videoPlayer.play().catch(console.error);
                }
            });

            this.log('Playing preview...');
        } catch (error) {
            console.error('Preview error:', error);
            this.log('Error playing preview', 'error');
        }
    }

    async saveMontageChanges(settings) {
        try {
            if (!settings.clips || settings.clips.length === 0) {
                this.log('No clips selected for montage', 'warning');
                return;
            }

            this.log('Generating montage...');
            
            // Convert settings to correct format
            const montageSettings = {
                clips: settings.clips,
                audioFile: document.getElementById('audioSelect')?.value || null,
                clipVolume: parseFloat(document.getElementById('clipVolume')?.value || 70) / 100,
                musicVolume: parseFloat(document.getElementById('musicVolume')?.value || 30) / 100,
                outputFileName: `montage_${Date.now()}.mp4`
            };

            console.log('Montage settings:', montageSettings); // Debug log

            const result = await api.generateCustomMontage(montageSettings);

            if (result.success) {
                this.log('Montage generated successfully', 'success');
                await this.loadClips('montage');
                await this.toggleEditMode(false);
            }
        } catch (error) {
            console.error('Error generating montage:', error);
            this.log(`Error generating montage: ${error.message}`, 'error');
        }
    }

    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }

    initializeEventListeners() {
        // Sidebar Navigation
        const navButtons = document.querySelectorAll('.nav-button');
        if (navButtons.length === 0) {
            console.warn('No navigation buttons found');
            return;
        }

        navButtons.forEach(button => {
            // Skip settings button as it's handled separately
            if (button.id === 'settingsButton') return;

            button.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                if (!section) {
                    console.error('Navigation button missing data-section attribute', e.currentTarget);
                    return;
                }
                if (!sections[section]) {
                    console.error(`Invalid section: ${section}`);
                    return;
                }
                this.handleNavigation(e.currentTarget, section);
            });
        });

        // Special handler for settings button
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                window.electronAPI.openSettings().catch(error => {
                    console.error('Failed to open settings:', error);
                    this.log('Failed to open settings window');
                });
            });
        }

        // Log events
        api.onLog(message => this.log(message));
    }

    async handleNavigation(button, sectionName) {
        if (!this.initialized) {
            console.error('Cannot handle navigation: UI not initialized');
            return;
        }

        if (!sections[sectionName]) {
            console.error(`Cannot handle navigation: Invalid section '${sectionName}'`);
            return;
        }

        try {
            // Update active state
            document.querySelectorAll('.nav-button')
                .forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Handle edit mode transition
            if (this.editMode && sectionName !== 'edit') {
                // Exit edit mode when navigating to other sections
                await this.toggleEditMode(false);
            }

            // Update content for non-edit sections
            if (sectionName !== 'edit') {
                this.currentSection = sectionName;
                await this.updateContent(sectionName);
            } else {
                // Enter edit mode
                await this.toggleEditMode(true);
            }
        } catch (error) {
            console.error('Navigation error:', error);
            this.log(`Navigation error: ${error.message}`, 'error');
        }
    }

    async updateContent(sectionName) {
        if (!this.initialized || !this.dynamicContent) {
            console.error('Cannot update content: UI not initialized');
            return;
        }

        try {
            // Clear existing content
            this.dynamicContent.innerHTML = '';
            
            // Insert new content
            this.dynamicContent.innerHTML = sections[sectionName];

            // Find and activate the new section
            const newSection = this.dynamicContent.querySelector('section');
            if (newSection) {
                newSection.classList.add('section-active');
            }

            // Initialize section handlers
            await this.initializeSectionHandlers(sectionName);
            
            // Handle media section visibility
            const mediaSection = document.querySelector('.mediaSection');
            if (mediaSection) {
                mediaSection.style.display = sectionName === 'edit' ? 'none' : '';
            }
        } catch (error) {
            console.error(`Error updating content for ${sectionName}:`, error);
            this.log(`Error loading section ${sectionName}: ${error.message}`);
        }
    }

    initializeSectionHandlers(sectionName) {
        const handler = sectionHandlers[sectionName];
        if (handler) {
            handler(this);
        }
    }

    log(message, type = 'info') {
        const logOutput = document.getElementById('logOutput');
        if (!logOutput) return;

        // Create a unique key for this message type + content
        const logKey = `${type}:${message}`;
        const now = Date.now();

        // Check if this exact message is in cooldown
        if (this.logCooldowns.has(logKey)) {
            const cooldownEnd = this.logCooldowns.get(logKey);
            if (now < cooldownEnd) {
                return; // Skip duplicate message during cooldown
            }
        }

        // Check if this message is too similar to the last one
        const lastLog = this.lastLogs.get(type);
        if (lastLog) {
            const { text, timestamp } = lastLog;
            const isSimilar = this.isSimilarMessage(text, message);
            if (isSimilar && (now - timestamp) < this.LOG_COOLDOWN) {
                return; // Skip similar message during cooldown
            }
        }

        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: true,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });

        // Define status indicators with unique emojis
        const indicators = {
            info: '💡',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            system: '🔧',
            highlight: '🌟'
        };

        // Format the log message
        const prefix = (indicators[type] || indicators.info) + ' ' + type.charAt(0).toUpperCase() + type.slice(1);
        const formattedMessage = `[${timestamp}] ${prefix}: ${message}\n`;

        // Update log content
        logOutput.value += formattedMessage;
        logOutput.scrollTop = logOutput.scrollHeight;

        // Update last log and set cooldown
        this.lastLogs.set(type, { text: message, timestamp: now });
        this.logCooldowns.set(logKey, now + this.LOG_COOLDOWN);

        // Clear old cooldowns periodically
        this.cleanOldCooldowns();
    }

    isSimilarMessage(oldMsg, newMsg) {
        // Remove common dynamic parts (timestamps, IDs, etc.)
        const normalize = (msg) => msg.toLowerCase()
            .replace(/[0-9a-f]{8}/g, '') // Remove hex IDs
            .replace(/\d{1,2}:\d{2}:\d{2}/g, '') // Remove times
            .trim();

        const normalizedOld = normalize(oldMsg);
        const normalizedNew = normalize(newMsg);

        // Check if messages are similar using Levenshtein distance
        return this.getLevenshteinDistance(normalizedOld, normalizedNew) < 3;
    }

    getLevenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = Array(b.length + 1).fill(null)
            .map(() => Array(a.length + 1).fill(null));

        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const substitute = matrix[j - 1][i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1, // deletion
                    matrix[j][i - 1] + 1, // insertion
                    substitute      // substitution
                );
            }
        }

        return matrix[b.length][a.length];
    }

    cleanOldCooldowns() {
        const now = Date.now();
        for (const [key, cooldownEnd] of this.logCooldowns.entries()) {
            if (now >= cooldownEnd) {
                this.logCooldowns.delete(key);
            }
        }
    }

    async loadClips(type = 'replay') {
        try {
            const clips = await api.getClipList();
            const containerId = type === 'replay' ? 'replayContainer' : 'montageContainer';
            const container = document.getElementById(containerId);
            
            if (!container) {
                console.error(`Container ${containerId} not found`);
                return;
            }

            const filteredClips = clips.filter(clip => 
                type === 'replay' ? !clip.startsWith('montage_') : clip.startsWith('montage_')
            ).sort((a, b) => {
                const getTimestamp = filename => parseInt(filename.split('_')[1]);
                return getTimestamp(b) - getTimestamp(a);
            });

            const clipPromises = filteredClips.map(async clip => {
                let metadataHtml = '';
                if (type === 'montage') {
                    const metadata = await getClipMetadata(`clips/${clip}`);
                    const clipCount = metadata?.clip_count || 'Unknown';
                    metadataHtml = `<span class="clip-count"> • ${clipCount} clips</span>`;
                }

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
                            ${metadataHtml}
                        </div>
                    </div>
                `;
            });

            const clipsHtml = await Promise.all(clipPromises);
            container.innerHTML = filteredClips.length === 0 
                ? `<p>No ${type} clips available.</p>` 
                : clipsHtml.join('');

            // Add click listeners after videos are loaded
            const clipItems = container.querySelectorAll('.clip-item');
            clipItems.forEach(item => {
                item.addEventListener('click', () => {
                    const clipName = item.getAttribute('data-clip');
                    this.playClip(clipName);
                });
            });

        } catch (error) {
            this.log(`Error loading ${type}s: ${error.message}`);
        }
    }

    async playClip(clipId) {
        const videoPlayer = document.getElementById('editVideoPlayer');
        const videoSource = document.getElementById('editVideoSource');
        
        if (videoPlayer && videoSource) {
            videoSource.src = `clips/${clipId}`; // Updated path
            videoPlayer.load();
            videoPlayer.play();
        }
    }

    populateAudioResults(samples) {
        const audioResults = document.getElementById('audioResults');
        if (!audioResults) return;
    
        // Ensure audioResults has position relative for absolute positioning
        audioResults.style.position = 'relative';

        // Add scroll to top button with image
        const scrollButton = document.createElement('button');
        scrollButton.className = 'scroll-top';
        const img = document.createElement('img');
        img.src = './assets/up.png';
        img.alt = 'Scroll to top';
        scrollButton.appendChild(img);
        audioResults.appendChild(scrollButton);

        // Show/hide scroll button based on scroll position
        audioResults.addEventListener('scroll', () => {
            scrollButton.classList.toggle('visible', audioResults.scrollTop > 300);
        });

        // Scroll to top when clicked
        scrollButton.addEventListener('click', () => {
            audioResults.scrollTo({ top: 0, behavior: 'smooth' });
        });

        audioResults.innerHTML = '';
    
        samples.forEach(sample => {
            if (!sample || !sample.previews) {
                console.warn('Invalid sample:', sample);
                return;
            }
    
            const sampleDiv = document.createElement('div');
            sampleDiv.classList.add('audio-sample');
    
            // Add sample metadata
            const metadata = this.createAudioMetadata(sample);
            sampleDiv.appendChild(metadata);
    
            // Add controls
            const controls = this.createAudioControls(sample);
            sampleDiv.appendChild(controls);
    
            audioResults.appendChild(sampleDiv);
        });
    }
    
    createAudioControls(sample) {
        const controls = document.createElement('div');
        controls.classList.add('audio-controls');
    
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.classList.add('buttons-container');
    
        // Preview button
        const previewButton = document.createElement('button');
        previewButton.textContent = 'Preview';
        previewButton.classList.add('preview-button');
        previewButton.addEventListener('click', () => {
            if (this.currentAudioPlayer) {
                this.currentAudioPlayer.pause();
                if (this.currentAudioPlayer.parentElement === controls) {
                    controls.removeChild(this.currentAudioPlayer);
                    previewButton.textContent = 'Preview';
                    return;
                }
            }
    
            const audio = document.createElement('audio');
            audio.src = sample.previews['preview-hq-mp3'];
            audio.controls = true;
            audio.classList.add('audio-player'); // Add class for styling
            controls.appendChild(audio);
            audio.play();
            this.currentAudioPlayer = audio;
            previewButton.textContent = 'Close';
    
            audio.onended = () => {
                controls.removeChild(audio);
                previewButton.textContent = 'Preview';
                this.currentAudioPlayer = null;
            };
        });
        buttonsContainer.appendChild(previewButton);
    
        // Download button with loading state
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.classList.add('download-button');
        
        downloadButton.addEventListener('click', async () => {
            try {
                // Show loading spinner
                downloadButton.innerHTML = '<div class="button-spinner"></div>';
                downloadButton.disabled = true;
                
                await api.downloadAndSaveAudio(sample);
                
                // Reset button state
                downloadButton.textContent = 'Downloaded';
                downloadButton.classList.add('success');
            } catch (error) {
                downloadButton.textContent = 'Failed';
                downloadButton.classList.add('error');
                this.log(`Error downloading ${sample.name}: ${error.message}`);
            } finally {
                downloadButton.disabled = false;
            }
        });
        buttonsContainer.appendChild(downloadButton);
    
        // Add buttons container first
        controls.appendChild(buttonsContainer);
    
        return controls;
    }
    
    createAudioMetadata(sample) {
        const metadata = document.createElement('div');
        metadata.classList.add('audio-meta');
    
        // Create header section with title and rating
        const header = document.createElement('div');
        header.classList.add('audio-header');
    
        const title = document.createElement('h3');
        title.textContent = sample.name;
        title.title = sample.name; // Add title attribute for tooltip
        header.appendChild(title);
    
        if (sample.avg_rating) {
            const rating = document.createElement('div');
            rating.classList.add('rating');
            const stars = '★'.repeat(Math.round(sample.avg_rating)) + '☆'.repeat(5 - Math.round(sample.avg_rating));
            rating.textContent = `${stars} (${sample.num_ratings} ratings)`;
            header.appendChild(rating);
        }
    
        metadata.appendChild(header);
    
        // Add key details section
        const details = document.createElement('div');
        details.classList.add('audio-details');
    
        // Duration and file info
        if (sample.duration) {
            const duration = document.createElement('span');
            duration.classList.add('detail');
            duration.innerHTML = `<i>Duration:</i> ${Math.floor(sample.duration)}s`;
            details.appendChild(duration);
        }
    
        if (sample.type && sample.samplerate) {
            const format = document.createElement('span');
            format.classList.add('detail');
            format.innerHTML = `<i>Format:</i> ${sample.type.toUpperCase()} ${sample.samplerate}Hz`;
            details.appendChild(format);
        }
    
        metadata.appendChild(details);
    
        // Add description if available with word limit and read more
        if (sample.description) {
            const descContainer = document.createElement('div');
            descContainer.classList.add('description-container');

            const desc = document.createElement('p');
            desc.classList.add('description');
            const words = sample.description.split(/\s+/);
            
            if (words.length > 30) {
                const shortText = words.slice(0, 30).join(' ') + '...';
                desc.textContent = shortText;
                
                const readMoreBtn = document.createElement('button');
                readMoreBtn.classList.add('description-toggle');
                readMoreBtn.textContent = 'Read more';
                
                readMoreBtn.addEventListener('click', () => {
                    const isExpanded = desc.classList.toggle('expanded');
                    if (isExpanded) {
                        desc.textContent = sample.description;
                        readMoreBtn.textContent = 'Show less';
                    } else {
                        desc.textContent = shortText;
                        readMoreBtn.textContent = 'Read more';
                    }
                });
                
                descContainer.appendChild(desc);
                descContainer.appendChild(readMoreBtn);
            } else {
                desc.textContent = sample.description;
                descContainer.appendChild(desc);
            }
            
            metadata.appendChild(descContainer);
        }
    
        // Add tags if available
        if (sample.tags && sample.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.classList.add('tags-container');
            sample.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.classList.add('tag');
                tagSpan.textContent = tag;
                tagsContainer.appendChild(tagSpan);
            });
            metadata.appendChild(tagsContainer);
        }
    
        // Add waveform image if available
        if (sample.images?.waveform_m) {
            const waveform = document.createElement('img');
            waveform.src = sample.images.waveform_m;
            waveform.alt = 'Audio waveform';
            waveform.classList.add('waveform');
            metadata.appendChild(waveform);
        }
    
        // Add author and stats
        const footer = document.createElement('div');
        footer.classList.add('audio-footer');
        footer.innerHTML = `
            <span class="author">by ${sample.username}</span>
            <span class="stats">
                ${sample.num_downloads || 0} downloads
                • ${sample.num_comments || 0} comments
                • ${new Date(sample.created).toLocaleDateString()}
            </span>
        `;
        metadata.appendChild(footer);
    
        return metadata;
    }
    
    // ... additional UI methods (initializeActionsSection, etc.)
    // ...existing code for other UI methods...
}

// Export a single instance
export const ui = new UI();

function createAudioSample(result) {
    const sample = document.createElement('div');
    sample.className = 'audio-sample';
    
    // Create description container and toggle button
    const descContainer = document.createElement('div');
    descContainer.className = 'audio-description';
    descContainer.textContent = result.description || 'No description available';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'description-toggle';
    toggleBtn.textContent = 'Read more';
    
    toggleBtn.addEventListener('click', () => {
        const isExpanded = descContainer.classList.toggle('expanded');
        toggleBtn.textContent = isExpanded ? 'Show less' : 'Read more';
    });

    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'buttons-container';
    
    // Create preview button
    const previewBtn = document.createElement('button');
    previewBtn.className = 'preview-button';
    previewBtn.textContent = 'Preview';
    
    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-button';
    downloadBtn.textContent = 'Download';
    
    // Add buttons to container
    buttonsContainer.appendChild(previewBtn);
    buttonsContainer.appendChild(downloadBtn);
    
    // Add all elements to sample
    sample.appendChild(/* ...other elements... */);
    sample.appendChild(descContainer);
    sample.appendChild(toggleBtn);
    sample.appendChild(buttonsContainer);
    
    return sample;
}

async function getClipMetadata(filepath) {
    try {
        // Extract filename from filepath
        const filename = filepath.split('/').pop();
        return await window.electronAPI.getMontageMetadata(filename);
    } catch (error) {
        console.error('Error getting clip metadata:', error);
        return null;
    }
}
