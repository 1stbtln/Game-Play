window.addEventListener('DOMContentLoaded', () => {
    const logOutput = document.getElementById('logOutput');
    const clipsContainer = document.getElementById('clipsContainer');

    const appendLog = (message) => {
        logOutput.value += `${message}\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    const updateClipsPreview = async () => {
        try {
            const clips = await window.electronAPI.getClipList();
            clipsContainer.innerHTML = ''; // Clear current clips preview

            clips.forEach(clip => {
                const clipElement = document.createElement('div');
                clipElement.classList.add('clip');

                const videoElement = document.createElement('video');
                videoElement.src = `./clips/${clip}`;
                videoElement.controls = true;
                videoElement.style.width = '100%';

                const label = document.createElement('p');
                label.textContent = clip;

                clipElement.appendChild(videoElement);
                clipElement.appendChild(label);
                clipsContainer.appendChild(clipElement);
            });
        } catch (error) {
            appendLog(`Error updating clips preview: ${error.message}`);
        }
    };

    document.getElementById('connectOBSButton').addEventListener('click', async () => {
        await window.electronAPI.connectOBS();
        appendLog('Attempting to connect to OBS...');
    });

    document.getElementById('startReplayBufferButton').addEventListener('click', async () => {
        await window.electronAPI.startReplayBuffer();
        appendLog('Starting replay buffer...');
    });

    document.getElementById('saveReplayBufferButton').addEventListener('click', async () => {
        await window.electronAPI.saveReplayBuffer();
        appendLog('Saving replay buffer...');
        await updateClipsPreview();
    });

    document.getElementById('startGameButton').addEventListener('click', () => {
        window.electronAPI.startTriggerDetection();
        appendLog('Game started.');
    });

    document.getElementById('endGameButton').addEventListener('click', () => {
        window.electronAPI.stopTriggerDetection();
        appendLog('Game ended.');
    });

    document.getElementById('montageifyButton').addEventListener('click', async () => {
        await window.electronAPI.montageifyClips();
        appendLog('Montageify button clicked.');
        await updateClipsPreview();
    });

    // Initial update of the clips preview
    updateClipsPreview();

    window.electronAPI.onLog((message) => {
        appendLog(message);
    });
});
