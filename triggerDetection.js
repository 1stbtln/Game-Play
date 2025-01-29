const screenshot = require('screenshot-desktop');
const tesseract = require('tesseract.js');
const { EventEmitter } = require('events');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const OBSWebSocket = require('obs-websocket-js').OBSWebSocket;
const ValidationMapping = require('./utils/validationMapping');
const SessionCounter = require('./utils/sessionCounter');

const PRIMARY_TRIGGER_PHRASES = [
    'YOU',
    'OU',
    'YO',
    'KNOCKED',
    'KNOCK',
    'OUT'
].map(phrase => phrase.toUpperCase());

const SECONDARY_TRIGGER_PHRASES = [
    'KNOCKED',
    'KNOCK',
    'OUT'
].map(phrase => phrase.toUpperCase());

class TriggerDetection extends EventEmitter {
    constructor(triggerPhrases, obsConfig) {
        super();
        this.primaryTriggerPhrases = PRIMARY_TRIGGER_PHRASES;
        this.secondaryTriggerPhrases = SECONDARY_TRIGGER_PHRASES;
        this.running = false;
        this.outputDir = path.join(__dirname, 'validationPhotos');
        this.detectionTimeout = false;
        this.secondaryTimeout = false;
        this.checkingSecondaryROI = false;
        this.sessionsPath = path.join(__dirname, 'config', 'sessions.json');

        this.obs = new OBSWebSocket();
        this.obsConfig = obsConfig;
        this.isConnectedToOBS = false;
        this.setupOBSConnection();

        this.validationMapping = new ValidationMapping();
        this.clipOutputDir = path.join(__dirname, 'clips');
        this.sessionCounter = new SessionCounter();
        this.currentSessionId = null;
        this.lastPrimaryClip = null;

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir);
        }
        if (!fs.existsSync(this.clipOutputDir)) {
            fs.mkdirSync(this.clipOutputDir);
        }

        this.validationPhotosDir = path.join(__dirname, 'validationPhotos');
        if (!fs.existsSync(this.validationPhotosDir)) {
            fs.mkdirSync(this.validationPhotosDir, { recursive: true });
        }

        try {
            const sessionsData = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'));
            const currentSession = sessionsData.sessions.find(session => !session.endTime);
            this.currentSessionId = currentSession ? currentSession.id : null;
            console.log('Initialized TriggerDetection with session ID:', this.currentSessionId);
        } catch (error) {
            console.error('Error reading initial session ID:', error);
            this.currentSessionId = null;
        }
    }

    async init() {
        await this.validationMapping.loadMapping();
        if (!fs.existsSync(this.clipOutputDir)) {
            await fs.promises.mkdir(this.clipOutputDir);
        }
    }

    async setupOBSConnection() {
        try {
            await this.obs.connect(`ws://${this.obsConfig.host}:${this.obsConfig.port}`, 
                this.obsConfig.password);
            this.isConnectedToOBS = true;
        } catch (error) {
            this.isConnectedToOBS = false;
        }
    }

    async saveReplayBuffer() {
        if (!this.isConnectedToOBS) {
            return { success: false, error: 'Not connected to OBS' };
        }
        
        const saveStartTime = Date.now();
        console.log(`[${new Date().toISOString()}] Initiating replay save...`);
    
        try {
            await this.obs.call('SaveReplayBuffer');
            this.lastSaveTime = Date.now();
            
            await new Promise(resolve => setTimeout(resolve, 1000));
    
            for (let attempt = 0; attempt < 3; attempt++) {
                const files = fs.readdirSync(this.clipOutputDir);
                const newFile = files
                    .filter(f => f.endsWith('.mkv') || f.endsWith('.mp4'))
                    .sort((a, b) => {
                        const statA = fs.statSync(path.join(this.clipOutputDir, a));
                        const statB = fs.statSync(path.join(this.clipOutputDir, b));
                        return statB.mtimeMs - statA.mtimeMs;
                    })[0];
    
                if (newFile) {
                    const clipPath = path.join(this.clipOutputDir, newFile);
                    const saveEndTime = Date.now();
                    console.log(`Replay save completed in ${saveEndTime - saveStartTime}ms`);
                    return { success: true, clipPath };
                }
    
                await new Promise(resolve => setTimeout(resolve, 500));
            }
    
            throw new Error('No replay file found after retries');
        } catch (error) {
            console.error('Failed to save replay buffer:', error);
            return { success: false, error };
        }
    }

    start() {
        if (!this.running) {
            if (!this.currentSessionId) {
                const sessionsData = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'));
                const currentSession = sessionsData.sessions.find(session => !session.endTime);
                this.currentSessionId = currentSession ? currentSession.id : null;
                console.log('Updated session ID on start:', this.currentSessionId);
            }
            this.running = true;
            this.detectTriggers();
        }
    }

    stop() {
        this.running = false;
        if (this.isConnectedToOBS) {
            this.obs.disconnect();
            this.isConnectedToOBS = false;
        }
    }

    async detectTriggers() {
        while (this.running) {
            try {
                const frame = await this.captureScreen();
                const ocrResult = await this.runOCR(frame);
                
                if (ocrResult && ocrResult.text) {
                    await this.checkForTriggers(ocrResult.text, frame);
                }
            } catch (error) {
                console.error('Detection error:', error);
            }
            await this.sleep(500);
        }
    }

    async captureScreen() {
        try {
            const imgBuffer = await screenshot({ format: 'png' });
            const image = await Jimp.read(Buffer.from(imgBuffer));
    
            const screenHeight = image.getHeight();
            const screenWidth = image.getWidth();
    
            const primaryRoiHeight = Math.floor(screenHeight * (43 / 1073));
            const roiWidth = Math.floor(screenWidth * 0.6);
            const roiX = Math.floor((screenWidth - roiWidth) / 2);
            
            let roiY, roiHeight;
            if (this.checkingSecondaryROI) {
                roiHeight = Math.floor(primaryRoiHeight * 0.7);
                roiY = Math.floor(screenHeight * (0.85 - 0.18)) - roiHeight * 3 + Math.floor(screenHeight * 0.05) + Math.floor(roiHeight * 0.4);
            } else {
                roiHeight = primaryRoiHeight;
                roiY = Math.floor(screenHeight * (0.85 - 0.18));
            }
    
            return image.crop(roiX, roiY, roiWidth, roiHeight);
        } catch (error) {
            console.error('Screen capture error details:', error);
            throw new Error(`Screen capture failed: ${error.message}`);
        }
    }    

    async runOCR(image) {
        try {
            const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
            const { data } = await tesseract.recognize(buffer);
            
            return {
                text: data.text.toUpperCase().replace(/\s+/g, ' ').trim(),
                words: data.words
            };
        } catch (error) {
            console.error('OCR error:', error);
            return null;
        }
    }

    async checkForTriggers(text, image) {
        const triggerPhrases = this.checkingSecondaryROI ? this.secondaryTriggerPhrases : this.primaryTriggerPhrases;
        const matchedPhrase = triggerPhrases.find(phrase => text.includes(phrase));
        
        if (matchedPhrase) {
            console.log(`[${new Date().toISOString()}] Detected "${text}" in ${this.checkingSecondaryROI ? 'secondary' : 'primary'} ROI`);
            
            const canTrigger = !this.detectionTimeout || (this.checkingSecondaryROI && !this.secondaryTimeout);
            
            if (canTrigger) {
                try {
                    const validationPath = await this.saveValidationImage(image, text, matchedPhrase);
                    let replaySaveResult = null;

                    if (!this.checkingSecondaryROI) {
                        replaySaveResult = await this.saveReplayBuffer();
                        if (replaySaveResult.success) {
                            this.lastPrimaryClip = replaySaveResult.clipPath;
                            console.log('Stored primary clip path:', this.lastPrimaryClip);
                        }
                        
                        this.detectionTimeout = true;
                        this.checkingSecondaryROI = true;
                        
                        setTimeout(() => {
                            if (!this.secondaryTimeout) {
                                this.detectionTimeout = false;
                                this.checkingSecondaryROI = false;
                                this.lastPrimaryClip = null;
                            }
                        }, 7000);
                        
                    } else {
                        if (this.lastPrimaryClip) {
                            try {
                                console.log('Attempting to delete primary clip:', this.lastPrimaryClip);
                                
                                if (fs.existsSync(this.lastPrimaryClip)) {
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                    
                                    const validationPath = await this.validationMapping.removeMapping(this.lastPrimaryClip);
                                    
                                    await fs.promises.unlink(this.lastPrimaryClip);
                                    console.log('Successfully deleted primary clip');
                                    
                                    if (validationPath && fs.existsSync(validationPath)) {
                                        await fs.promises.unlink(validationPath);
                                        console.log('Successfully deleted associated validation photo:', validationPath);
                                    }
                                } else {
                                    console.warn('Primary clip not found:', this.lastPrimaryClip);
                                }
                            } catch (deleteError) {
                                console.error('Error during deletion:', deleteError);
                            }
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000));
                        replaySaveResult = await this.saveReplayBuffer();
                        
                        this.secondaryTimeout = true;
                        
                        setTimeout(() => {
                            this.secondaryTimeout = false;
                            this.detectionTimeout = false;
                            this.checkingSecondaryROI = false;
                            this.lastPrimaryClip = null;
                        }, 7000);
                    }

                    if (replaySaveResult.success) {
                        console.log('Trigger processed successfully:', {
                            roi: this.checkingSecondaryROI ? 'secondary' : 'primary',
                            phrase: matchedPhrase,
                            validationPath,
                            clipPath: replaySaveResult.clipPath
                        });
                        
                        this.validationMapping.addMapping(validationPath, replaySaveResult.clipPath);
                    }

                    this.emit('trigger-detected', {
                        phrase: matchedPhrase,
                        timestamp: Date.now(),
                        replaySaved: replaySaveResult.success,
                        validationPath,
                        clipPath: replaySaveResult.clipPath,
                        roi: this.checkingSecondaryROI ? 'secondary' : 'primary'
                    });

                } catch (error) {
                    console.error('Error processing trigger:', error);
                    this.detectionTimeout = false;
                    this.secondaryTimeout = false;
                    this.checkingSecondaryROI = false;
                    this.lastPrimaryClip = null;
                }
            }
        }
    }

    async saveValidationImage(image, detectedText, triggerPhrase) {
        if (!this.currentSessionId) {
            try {
                const sessionsData = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf-8'));
                const currentSession = sessionsData.sessions.find(session => !session.endTime);
                this.currentSessionId = currentSession ? currentSession.id : null;
                console.log('Updated session ID before saving validation photo:', this.currentSessionId);
            } catch (error) {
                console.error('Error reading session ID:', error);
            }
        }

        const sessionId = this.currentSessionId;
        if (!sessionId) {
            throw new Error('No active session ID found for validation photo');
        }

        const sessionCounter = this.sessionCounter.next();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFilePath = path.join(
            this.validationPhotosDir,
            `vPhoto_${this.currentSessionId}_${sessionCounter}_${timestamp}.png`
        );

        try {
            await image.clone().writeAsync(outputFilePath);
            console.log(`Saved validation photo: ${outputFilePath}`);

            this.emit('validation-saved', {
                sessionId: this.currentSessionId,
                counter: sessionCounter,
                type: 'trigger_validation',
                path: outputFilePath,
                text: detectedText,
                triggerPhrase,
                timestamp
            });

            return outputFilePath;
        } catch (error) {
            console.error('Error saving validation image:', error);
            throw error;
        }
    }

    async saveSecondaryROIImage(image, detectedText) {
        const sessionId = this.currentSessionId || this.getCurrentSessionId() || 'unknown';
        const sessionCounter = this.sessionCounter.next();
        const outputFilePath = path.join(this.outputDir, `secondROI_${sessionId}_${sessionCounter}.png`);

        try {
            await image.clone().writeAsync(outputFilePath);
            console.log(`Secondary ROI check saved: ${outputFilePath}`);
            console.log(`OCR Text: ${detectedText}`);
        } catch (error) {
            console.error('Error saving secondary ROI image:', error);
        }
    }

    saveClip(image, phrase) {
        const now = new Date();
        const timeString = formatValidationTimestamp();
        
        const sessionId = this.getCurrentSessionId() || 'unknown';
        const outputFilePath = path.join(this.outputDir, `vPhoto_${sessionId}_${timeString}.png`);

        return image.clone()
            .writeAsync(outputFilePath)
            .then(() => {
                this.emit('trigger-detected', { 
                    sessionId: sessionId,
                    timestamp: timeString,
                    type: 'validation_photo'
                });
            })
            .catch(() => {});
    }

    getCurrentSessionId() {
        try {
            const sessionsData = JSON.parse(fs.readFileSync(this.sessionsPath, 'utf8'));
            const currentSession = sessionsData.sessions.find(session => session.endTime === null);
            return currentSession ? currentSession.id : null;
        } catch (error) {
            console.error('Error reading sessions file:', error);
            return null;
        }
    }    

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TriggerDetection;