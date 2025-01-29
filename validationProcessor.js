const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { PATHS } = require('./constants');

// Initialize AWS config for Textract only
AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const textractClient = new AWS.Textract();

// Update valid phrases
const VALID_PHRASES = [
    'YOU KNOCKED OUT',
    'YOU FINALLY KILLED',
    'YOU KILLED',
    'KNOCKED OUT'
].map(phrase => phrase.toUpperCase());

// Update invalid phrases that should trigger deletion
const INVALID_PHRASES = [
    'KNOCKED YOU OUT',
    'KNOCKED YOU',
    'YOU OUT'
].map(phrase => phrase.toUpperCase());

async function analyzeImage(imageBuffer) {
    try {
        const params = {
            Document: {
                Bytes: imageBuffer
            }
        };

        const result = await textractClient.detectDocumentText(params).promise();
        const detectedText = result.Blocks
            .filter(block => block.BlockType === 'LINE')
            .map(line => line.Text.toUpperCase())
            .join(' ');

        return detectedText;
    } catch (error) {
        console.error('Textract analysis error:', error);
        throw error;
    }
}

async function isValidText(detectedText) {
    return VALID_PHRASES.some(phrase => detectedText.includes(phrase));
}

async function validateSessionPhotos(sessionId) {
    const photoDir = PATHS.VALIDATION_PHOTOS;
    const clipsDir = path.join(__dirname, 'clips');
    
    const sessionPhotos = fs.readdirSync(photoDir)
        .filter(file => file.includes(sessionId) && /\.(jpg|png)$/i.test(file));

    if (sessionPhotos.length === 0) {
        console.log('No validation photos found for session:', sessionId);
        return { validPhotos: [], failedPhotos: [], requiresConfirmation: false };
    }

    const validationResults = {
        validPhotos: [],
        failedPhotos: [],
        requiresConfirmation: false
    };

    for (const photo of sessionPhotos) {
        const filePath = path.join(photoDir, photo);
        try {
            const imageBuffer = await fs.promises.readFile(filePath);
            const detectedText = await analyzeImage(imageBuffer);
            
            // Check if any invalid phrases are found
            const hasInvalidPhrase = INVALID_PHRASES.some(phrase => detectedText.includes(phrase));

            if (hasInvalidPhrase) {
                // Find and delete associated clip
                const clipName = findAssociatedClip(photo, sessionId, clipsDir);
                const clipPath = clipName ? path.join(clipsDir, clipName) : null;

                validationResults.failedPhotos.push({
                    name: photo,
                    path: filePath,
                    text: detectedText,
                    clipPath
                });

                // Delete invalid photo and its clip
                await fs.promises.unlink(filePath);
                if (clipPath && fs.existsSync(clipPath)) {
                    await fs.promises.unlink(clipPath);
                }

                console.log(`Deleted invalid photo and clip containing phrase: ${photo}`);
            } else {
                validationResults.validPhotos.push({
                    name: photo,
                    text: detectedText
                });
            }
        } catch (error) {
            console.error(`Error processing photo ${photo}:`, error);
            validationResults.failedPhotos.push({
                name: photo,
                error: error.message
            });
        }
    }

    return validationResults;
}

function findAssociatedClip(photoName, sessionId, clipsDir) {
    const timeStamp = photoName.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}/)?.[0];
    if (!timeStamp) return null;

    const clips = fs.readdirSync(clipsDir);
    return clips.find(clip => 
        clip.startsWith(sessionId) && 
        clip.includes(timeStamp)
    );
}

module.exports = { validateSessionPhotos };