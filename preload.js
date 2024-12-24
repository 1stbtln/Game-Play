const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveConfig: (config) => ipcRenderer.invoke('saveConfig', config),
    connectOBS: () => ipcRenderer.invoke('connectOBS'),
    startNewSession: () => ipcRenderer.invoke('startNewSession'),
    generateMontage: () => ipcRenderer.invoke('generateMontage'),
    startReplayBuffer: () => ipcRenderer.invoke('startReplayBuffer'),
    saveReplayBuffer: () => ipcRenderer.invoke('saveReplayBuffer'),
    startTriggerDetection: () => ipcRenderer.invoke('startTriggerDetection'),
    stopTriggerDetection: () => ipcRenderer.invoke('stopTriggerDetection'),
    montageifyClips: () => ipcRenderer.invoke('montageifyClips'),
    getClipList: () => ipcRenderer.invoke('getClipList'),
    onLog: (callback) => ipcRenderer.on('log', (_, message) => callback(message)),
});
