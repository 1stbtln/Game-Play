const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Add helper function for recursive directory cleanup
function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
}

// Helper function to get media information
function getMediaInfo(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            
            resolve({
                format: metadata.format,
                duration: metadata.format.duration,
                streams: metadata.streams,
                videoStream,
                audioStream
            });
        });
    });
}

async function concatenateVideos(videoPaths, outputPath, options = {}) {
    console.log('Starting concatenation with:', { videoPaths, outputPath, options });

    const tempDir = path.join(path.dirname(outputPath), 'temp');
    !fs.existsSync(tempDir) && fs.mkdirSync(tempDir);

    try {
        // Find and separate outro path
        const outroIndex = videoPaths.findIndex(p => p.includes('assets/videoAssets/'));
        const regularClips = outroIndex === -1 ? videoPaths : videoPaths.slice(0, outroIndex);
        const outroPath = outroIndex === -1 ? null : videoPaths[outroIndex];

        // Process regular clips
        const clipPaths = regularClips.map(p => 
            path.isAbsolute(p) ? p : path.join(__dirname, 'clips', p)
        );

        // Add outro if present
        if (outroPath) {
            const absoluteOutroPath = path.isAbsolute(outroPath) 
                ? outroPath 
                : path.join(__dirname, outroPath);
            clipPaths.push(absoluteOutroPath);
        }

        // Validate all paths
        const validPaths = clipPaths.filter(p => {
            if (!fs.existsSync(p)) {
                console.warn(`File not found: ${p}`);
                return false;
            }
            console.log('Valid file found:', p);
            return true;
        });

        if (!validPaths.length) {
            throw new Error('No valid video files to process');
        }

        console.log('Processing files:', {
            regularClips: clipPaths.slice(0, -1),
            outro: clipPaths[clipPaths.length - 1]
        });

        // Create concat file with validated paths
        const listPath = path.join(tempDir, 'concat_list.txt');
        const fileList = validPaths
            .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
            .join('\n');
        fs.writeFileSync(listPath, fileList);

        // First pass: Clean concatenation
        const intermediatePath = path.join(tempDir, 'intermediate.mp4');
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(listPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions([
                    '-c:v copy',
                    '-c:a pcm_s16le',
                    '-vsync 2',
                    '-max_interleave_delta 0'
                ])
                .output(intermediatePath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        // Get intermediate file info
        const mediaInfo = await getMediaInfo(intermediatePath);
        const videoDuration = mediaInfo.duration;
        console.log('Intermediate video duration:', videoDuration);

        // Second pass: Add audio and fix duration
        const finalCommand = ffmpeg();

        finalCommand.input(intermediatePath)
            .inputOptions(['-accurate_seek']);

        if (options.backgroundMusic && fs.existsSync(options.backgroundMusic)) {
            finalCommand
                .input(options.backgroundMusic)
                .inputOptions(['-stream_loop -1'])
                .complexFilter([
                    `[1:a]atrim=0:${videoDuration}[music]`,
                    `[0:a]volume=${options.clipVolume}[mainAudio]`,
                    `[music]volume=${options.musicVolume}[bgm]`,
                    '[mainAudio][bgm]amix=inputs=2:duration=first[finalAudio]'
                ])
                .outputOptions(['-map 0:v', '-map [finalAudio]']);
        }

        finalCommand.outputOptions([
            '-c:v copy',
            '-c:a aac',
            '-b:a 192k',
            '-shortest',
            '-avoid_negative_ts make_zero',
            '-fflags +shortest',
            '-max_interleave_delta 0',
            '-movflags +faststart'
        ]);

        // Execute final render
        await new Promise((resolve, reject) => {
            finalCommand
                .on('start', cmdline => console.log('FFmpeg final pass:', cmdline))
                .on('end', async () => {
                    try {
                        // Clean up temp files
                        await cleanupTempFiles(tempDir, listPath, intermediatePath);
                        resolve();
                    } catch (error) {
                        console.error('Cleanup error:', error);
                        resolve(); // Continue despite cleanup error
                    }
                })
                .on('error', async (err) => {
                    console.error('FFmpeg error:', err);
                    try {
                        await cleanupTempFiles(tempDir, listPath, intermediatePath);
                    } catch (cleanupError) {
                        console.error('Cleanup error:', cleanupError);
                    }
                    reject(err);
                })
                .save(outputPath);
        });

        return true;
    } catch (error) {
        console.error('Concatenation error:', error);
        try {
            await cleanupTempFiles(tempDir);
        } catch (cleanupError) {
            console.error('Final cleanup error:', cleanupError);
        }
        throw error;
    }
}

// Helper function to clean up temporary files
async function cleanupTempFiles(tempDir, ...files) {
    try {
        // Delete individual files first
        for (const file of files) {
            if (file && fs.existsSync(file)) {
                await fs.promises.unlink(file);
            }
        }
        
        // Delete temp directory recursively
        if (tempDir && fs.existsSync(tempDir)) {
            await deleteFolderRecursive(tempDir);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
        throw error;
    }
}

module.exports = { concatenateVideos };
