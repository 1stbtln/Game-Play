const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MetadataManager {
    constructor() {
        this.metadataPath = path.join(__dirname, 'config', 'montage-metadata.json');
    }

    async initializeMetadataFile() {
        try {
            await fs.access(this.metadataPath);
        } catch {
            await fs.writeFile(this.metadataPath, JSON.stringify({ montages: [] }, null, 2));
        }
    }

    async addMontageMetadata(montageData) {
        await this.initializeMetadataFile();
        
        const metadata = await this.readMetadata();
        const newMontage = {
            montageId: uuidv4(),
            fileName: montageData.fileName,
            clipCount: montageData.clips.length,
            highlights: montageData.clips.map(clip => ({
                clipId: clip.replace(/\.[^/.]+$/, ""),
                timestamp: Date.now()
            })),
            createdAt: montageData.createdAt || Date.now(),
            sessionId: montageData.sessionId
        };

        metadata.montages.push(newMontage);
        await this.writeMetadata(metadata);
        return newMontage;
    }

    async getMontageMetadata(fileName) {
        const metadata = await this.readMetadata();
        return metadata.montages.find(m => m.fileName === fileName);
    }

    async readMetadata() {
        try {
            const data = await fs.readFile(this.metadataPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading metadata:', error);
            return { montages: [] };
        }
    }

    async writeMetadata(metadata) {
        await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));
    }
}

module.exports = new MetadataManager();
