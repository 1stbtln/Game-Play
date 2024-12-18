window.addEventListener('DOMContentLoaded', () => {
    const electronAPI = window.electronAPI;
    const obsConfigButton = document.getElementById('obsConfigButton');
    const configModal = document.getElementById('configModal');
    const closeConfigModal = document.getElementById('closeConfigModal');
    const logOutput = document.getElementById('logOutput');

    obsConfigButton.addEventListener('click', () => {
        configModal.style.display = 'block';
    });

    closeConfigModal.addEventListener('click', () => {
        configModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === configModal) {
            configModal.style.display = 'none';
        }
    });

    window.appendLog = (message) => {
        logOutput.value += `${message}\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    electronAPI.getConfig().then((config) => {
        document.getElementById('obsHost').value = config.obs_host || '';
        document.getElementById('obsPort').value = config.obs_port || '';
        document.getElementById('obsPassword').value = config.obs_password || '';
        document.getElementById('triggerPhrases').value = (config.trigger_phrases || []).join(', ');
        document.getElementById('saveLocation').value = config.save_location || '';
    });

    document.getElementById('saveConfigButton').addEventListener('click', () => {
        const configData = {
            obsHost: document.getElementById('obsHost').value,
            obsPort: document.getElementById('obsPort').value,
            obsPassword: document.getElementById('obsPassword').value,
            triggerPhrases: document.getElementById('triggerPhrases').value.split(',').map(phrase => phrase.trim()),
        };
        electronAPI.saveConfig(configData).then(() => appendLog("Configuration saved successfully."));
    });

    document.getElementById('chooseSaveLocation').addEventListener('click', () => {
        electronAPI.chooseSaveLocation().then((location) => {
            if (location) {
                document.getElementById('saveLocation').value = location;
            }
        });
    });

    document.getElementById('connectButton').addEventListener('click', () => {
        electronAPI.connectOBS().then(() => appendLog("Attempting to connect to OBS..."));
    });

    document.getElementById('startReplayBufferButton').addEventListener('click', () => {
        electronAPI.startReplayBuffer().then(() => appendLog("Attempting to start replay buffer..."));
    });

    document.getElementById('stopDetectionButton').addEventListener('click', () => {
        electronAPI.stopTriggerDetection().then(() => appendLog("Attempting to stop event detection..."));
    });

    document.getElementById('startDetectionButton').addEventListener('click', () => {
        electronAPI.startTriggerDetection().then(() => appendLog("Attempting to start event detection..."));
    });

    document.getElementById('editVideoButton').addEventListener('click', () => {
        electronAPI.editVideoWithAudio();
        appendLog("Compiling highlights...");
    });

    updateClipsSection();
});

function updateClipsSection() {
    const clipsContainer = document.getElementById('clipsContainer');
    if (!clipsContainer) {
        console.error("Could not find clips container element.");
        return;
    }

    clipsContainer.innerHTML = ''; 

    fetchAllClips().then((clipList) => {
        clipList.sort((a, b) => b.localeCompare(a));
        clipList.forEach(clipFileName => {
            const clipElement = createClipElement(clipFileName);
            clipsContainer.appendChild(clipElement);
        });
    }).catch((error) => {
        console.error("Error fetching clips:", error);
    });
}

async function fetchAllClips() {
    try {
        const clipList = await window.electronAPI.getClipList();
        return clipList.filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));
    } catch (error) {
        console.error('Error fetching clips:', error);
        return [];
    }
}

function createClipElement(clipFileName) {
    const clipDiv = document.createElement('div');
    clipDiv.classList.add('clip');
    clipDiv.style.width = '200px';

    const videoElement = document.createElement('video');
    videoElement.src = `./clips/${clipFileName}`;
    videoElement.controls = true;
    videoElement.style.width = '100%';

    clipDiv.appendChild(videoElement);
    return clipDiv;
}
