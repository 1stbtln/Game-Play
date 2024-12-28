const screenshot = require('screenshot-desktop');
const tesseract = require('tesseract.js');
const { EventEmitter } = require('events');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

class TriggerDetection extends EventEmitter {
    constructor(triggerPhrases) {
        super();
        this.triggerPhrases = triggerPhrases.map(phrase => phrase.toLowerCase());
        this.running = false;
        this.outputDir = path.join(__dirname, 'output'); 
        this.detectionTimeout = false; 
        this.lastDetectedEvent = null; 

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir);
        }
    }

    start() {
        if (!this.running) {
            this.running = true;
            console.log('Trigger detection started.');
            this.detectTriggers();
        }
    }

    stop() {
        this.running = false;
        console.log('Trigger detection stopped.');
    }

    async detectTriggers() {
        while (this.running) {
            if (this.detectionTimeout) {
                await this.sleep(1000);
                continue;
            }

            try {
                const frame = await this.captureScreen();
                const words = await this.runOCR(frame);
                this.checkForTriggers(words, frame);
            } catch (error) {
                console.error('Error in trigger detection:', error.message);
            }
            await this.sleep(1000); 
        }
    }

    async captureScreen() {
        try {
            const imgBuffer = await screenshot({ format: 'png' });
            const image = await Jimp.read(imgBuffer);

            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const centerWidth = width * 0.5; 
            const centerHeight = height * 0.2; 
            const centerX = (width - centerWidth) / 2;
            const centerY = (height - centerHeight) / 2 + centerHeight;

            image.crop(centerX, centerY, centerWidth, centerHeight);

            console.log(`Cropped region: CenterX=${centerX}, CenterY=${centerY}, Width=${centerWidth}, Height=${centerHeight}`);

            return image;
        } catch (error) {
            console.error('Error capturing screen:', error.message);
            throw error;
        }
    }

    async runOCR(image) {
        try {
            const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
            const { data } = await tesseract.recognize(buffer);

            console.log("OCR Detected Words:", data.words);

            const words = data.words.map(word => ({
                text: word.text.toLowerCase(),
                x: word.bbox ? word.bbox.x0 : null, 
                y: word.bbox ? word.bbox.y0 : null, 
            }));

            return words;
        } catch (error) {
            console.error('Error during OCR:', error.message);
            return [];
        }
    }

    checkForTriggers(words, image) {
        for (const word of words) {
            if (this.triggerPhrases.includes(word.text)) {
                console.log(`Detected trigger phrase: '${word.text}' at vertical position ${word.y}`);

                const currentTime = Date.now();

                if (this.lastDetectedEvent) {
                    const { text, time, y } = this.lastDetectedEvent;

                    if (
                        text === word.text && 
                        Math.abs(word.y - y) < 50 && 
                        currentTime - time < 3000 
                    ) {
                        console.log(`Ignored duplicate detection of '${word.text}' at similar vertical position.`);
                        return;
                    }
                }

                this.saveClip(image, word.text);
                this.lastDetectedEvent = { text: word.text, time: currentTime, y: word.y };
                this.startDetectionTimeout();
                break;
            }
        }
    }

    saveClip(image, phrase) {
        const timestamp = Date.now();
        const outputFilePath = path.join(this.outputDir, `clip_${phrase}_${timestamp}.png`);

        image.writeAsync(outputFilePath).then(() => {
            console.log(`Saved clip for phrase '${phrase}': ${outputFilePath}`);
        });

        this.emit('trigger-detected', phrase);
    }

    startDetectionTimeout() {
        this.detectionTimeout = true; 
        setTimeout(() => {
            this.detectionTimeout = false; 
            this.lastDetectedEvent = null; 
            console.log('Detection timeout cleared.');
        }, 7000); 
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TriggerDetection;
