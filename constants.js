require('dotenv').config();
const path = require('path');
const fs = require('fs');

const PATHS = {
    BASE: __dirname,
    CLIPS: path.join(__dirname, 'clips'),
    MONTAGE_METADATA: path.join(__dirname, 'clips', 'montage-metadata.json'),
    AUDIO_ASSETS: path.join(__dirname, 'clips', 'audioAssets'),
    VALIDATION_PHOTOS: path.join(__dirname, 'validationPhotos'),
    CONFIG: path.join(__dirname, 'config', 'config.json'),
    LOGS: path.join(__dirname, 'logs')
};

// Ensure all directories exist
for (const dir of Object.values(PATHS)) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const AWS = {
    BUCKET_NAME: process.env.AWS_BUCKET_NAME || 'gameplay-clip-validation'
};

module.exports = { PATHS, AWS };
