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
        this.outputDir = path.join(__dirname, 'output'); // Directory for saving matched images
        this.detectionTimeout = false; // Timeout flag to prevent multiple detections within 7 seconds
        this.lastDetectedEvent = null; // Tracks the last detected event (phrase, time, position)

        // Ensure the output directory exists
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
                await this.sleep(1000); // Wait 1 second before checking again
                continue;
            }

            try {
                const frame = await this.captureScreen();
                const words = await this.runOCR(frame);
                this.checkForTriggers(words, frame);
            } catch (error) {
                console.error('Error in trigger detection:', error.message);
            }
            await this.sleep(1000); // Pause for 1 second between captures
        }
    }

    async captureScreen() {
        try {
            const imgBuffer = await screenshot({ format: 'png' });
            const image = await Jimp.read(imgBuffer);

            // Original or known-good ROI settings
            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const centerWidth = width * 0.5; // Adjust based on your original settings
            const centerHeight = height * 0.2; // Adjust based on your original settings
            const centerX = (width - centerWidth) / 2;
            const centerY = (height - centerHeight) / 2 + centerHeight;

            image.crop(centerX, centerY, centerWidth, centerHeight);

            // Debug log to ensure ROI is accurate
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

            // Log OCR-detected words for debugging
            console.log("OCR Detected Words:", data.words);

            const words = data.words.map(word => ({
                text: word.text.toLowerCase(),
                x: word.bbox ? word.bbox.x0 : null, // Check for bounding box existence
                y: word.bbox ? word.bbox.y0 : null, // Check for bounding box existence
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

                // Check if this is a duplicate detection within the timeout
                if (this.lastDetectedEvent) {
                    const { text, time, y } = this.lastDetectedEvent;

                    // Ignore duplicate detections with small vertical differences
                    if (
                        text === word.text && // Same text
                        Math.abs(word.y - y) < 50 && // Vertical difference threshold
                        currentTime - time < 3000 // Timeout threshold (3 seconds)
                    ) {
                        console.log(`Ignored duplicate detection of '${word.text}' at similar vertical position.`);
                        return;
                    }
                }

                // Save clip and update last event
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
        this.detectionTimeout = true; // Set timeout flag
        setTimeout(() => {
            this.detectionTimeout = false; // Clear timeout after 7 seconds
            this.lastDetectedEvent = null; // Reset last detected event
            console.log('Detection timeout cleared.');
        }, 7000); // 7 seconds
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = TriggerDetection;
