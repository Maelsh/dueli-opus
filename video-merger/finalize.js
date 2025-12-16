/**
 * Finalize Stream - FFmpeg Concatenation
 * إنهاء البث - دمج FFmpeg
 * 
 * Merges all chunks into a single MP4 file
 * يدمج كل القطع في ملف MP4 واحد
 */

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

// Try to get FFmpeg path
let ffmpegPath = 'ffmpeg';
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    console.log('[Finalize] Using system FFmpeg');
}

// Configuration
const STORAGE_DIR = path.join(__dirname, 'storage');
const LIVE_DIR = path.join(STORAGE_DIR, 'live');
const VOD_DIR = path.join(STORAGE_DIR, 'vod');

// Ensure VOD directory exists
if (!fs.existsSync(VOD_DIR)) {
    fs.mkdirSync(VOD_DIR, { recursive: true });
}

/**
 * Finalize a match - merge all chunks into one video
 * @param {number} competitionId - Competition ID
 * @param {string} extension - File extension (webm or mp4)
 * @returns {Promise<string>} - Path to output file
 */
async function finalizeMatch(competitionId, extension = 'webm') {
    const matchDir = path.join(LIVE_DIR, `match_${competitionId}`);
    const outputFile = path.join(VOD_DIR, `match_${competitionId}.mp4`);

    console.log(`[Finalize] Starting finalization for match ${competitionId}`);
    console.log(`[Finalize] Match directory: ${matchDir}`);

    // Check if directory exists
    if (!fs.existsSync(matchDir)) {
        throw new Error(`Match directory not found: ${matchDir}`);
    }

    // Find all chunks
    const files = fs.readdirSync(matchDir);
    const chunks = files
        .filter(f => f.startsWith('chunk_') && (f.endsWith('.webm') || f.endsWith('.mp4')))
        .sort();

    if (chunks.length === 0) {
        throw new Error('No chunks found to merge');
    }

    console.log(`[Finalize] Found ${chunks.length} chunks to merge`);

    // Create concat file for FFmpeg
    const concatFile = path.join(matchDir, 'concat.txt');
    const concatContent = chunks.map(chunk => {
        const absPath = path.join(matchDir, chunk);
        return `file '${absPath}'`;
    }).join('\n');

    fs.writeFileSync(concatFile, concatContent);
    console.log(`[Finalize] Created concat file: ${concatFile}`);

    // Build FFmpeg command
    // Using -f concat with -safe 0 to allow absolute paths
    // Re-encode to MP4 for universal compatibility
    const ffmpegCommand = [
        ffmpegPath,
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c:v', 'libx264',    // Re-encode video to H.264
        '-c:a', 'aac',        // Re-encode audio to AAC
        '-preset', 'fast',    // Fast encoding preset
        '-crf', '23',         // Quality (lower = better, 23 is good balance)
        '-movflags', '+faststart', // Enable streaming
        '-y',                 // Overwrite output
        outputFile
    ].join(' ');

    console.log(`[Finalize] Running FFmpeg: ${ffmpegCommand}`);

    // Execute FFmpeg
    return new Promise((resolve, reject) => {
        exec(ffmpegCommand, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Finalize] FFmpeg error:', stderr);
                reject(error);
                return;
            }

            // Check if output file exists
            if (!fs.existsSync(outputFile)) {
                reject(new Error('Output file was not created'));
                return;
            }

            const stats = fs.statSync(outputFile);
            console.log(`[Finalize] Success! Output: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

            // Add ENDLIST to playlist
            const playlistFile = path.join(matchDir, 'playlist.m3u8');
            if (fs.existsSync(playlistFile)) {
                const playlist = fs.readFileSync(playlistFile, 'utf8');
                if (!playlist.includes('#EXT-X-ENDLIST')) {
                    fs.writeFileSync(playlistFile, playlist + '#EXT-X-ENDLIST\n');
                }
            }

            // Update metadata
            const metaFile = path.join(matchDir, 'metadata.json');
            if (fs.existsSync(metaFile)) {
                const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
                metadata.finalized = true;
                metadata.finalized_at = Date.now();
                metadata.vod_path = outputFile;
                metadata.vod_size = stats.size;
                fs.writeFileSync(metaFile, JSON.stringify(metadata, JSON.PRETTY_PRINT));
            }

            // Optional: Clean up chunks to save space
            // Uncomment the following to delete chunks after merge:
            /*
            for (const chunk of chunks) {
                fs.unlinkSync(path.join(matchDir, chunk));
            }
            fs.unlinkSync(concatFile);
            console.log('[Finalize] Cleaned up chunk files');
            */

            resolve(outputFile);
        });
    });
}

/**
 * Notify Dueli platform about finalized video
 * @param {number} competitionId 
 * @param {string} videoUrl 
 */
async function notifyPlatform(competitionId, videoPath) {
    // This would call back to the Dueli platform API
    // For now, just log
    console.log(`[Finalize] TODO: Notify platform about match ${competitionId} video: ${videoPath}`);

    // Example:
    // await fetch('https://dueli.pages.dev/api/competitions/update-vod', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ competition_id: competitionId, vod_url: videoPath })
    // });
}

// Export for use as module
module.exports = {
    finalizeMatch,
    notifyPlatform
};

// Run if executed directly (from finalize.php)
if (require.main === module) {
    const competitionId = parseInt(process.argv[2]);
    const extension = process.argv[3] || 'webm';

    if (!competitionId) {
        console.error('[Finalize] Usage: node finalize.js <competition_id> [extension]');
        process.exit(1);
    }

    console.log(`[Finalize] Starting finalization for competition ${competitionId}`);

    finalizeMatch(competitionId, extension)
        .then(outputPath => {
            console.log(`[Finalize] Completed: ${outputPath}`);
            return notifyPlatform(competitionId, outputPath);
        })
        .then(() => {
            console.log('[Finalize] All done!');
            process.exit(0);
        })
        .catch(error => {
            console.error('[Finalize] Failed:', error.message);
            process.exit(1);
        });
}
