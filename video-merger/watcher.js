/**
 * HLS Playlist Watcher
 * مراقب قائمة تشغيل HLS
 * 
 * Watches for new chunks and updates HLS playlist
 * يراقب القطع الجديدة ويحدث قائمة تشغيل HLS
 */

const fs = require('fs');
const path = require('path');

// Configuration
const STORAGE_DIR = path.join(__dirname, 'storage', 'live');
const CHUNK_DURATION = 10; // seconds per chunk

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Update HLS playlist for a match
 * @param {string} matchDir - Path to match directory
 */
function updatePlaylist(matchDir) {
    const matchId = path.basename(matchDir);

    // Read metadata to get extension
    const metaFile = path.join(matchDir, 'metadata.json');
    let extension = 'webm';

    if (fs.existsSync(metaFile)) {
        try {
            const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            extension = metadata.extension || 'webm';
        } catch (e) {
            console.error(`[Watcher] Error reading metadata for ${matchId}:`, e.message);
        }
    }

    // Find all chunks
    const files = fs.readdirSync(matchDir);
    const chunks = files
        .filter(f => f.startsWith('chunk_') && (f.endsWith('.webm') || f.endsWith('.mp4')))
        .sort();

    if (chunks.length === 0) {
        console.log(`[Watcher] No chunks found in ${matchId}`);
        return;
    }

    // Generate HLS playlist
    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n';
    playlist += `#EXT-X-TARGETDURATION:${CHUNK_DURATION}\n`;
    playlist += '#EXT-X-MEDIA-SEQUENCE:0\n\n';

    for (const chunk of chunks) {
        playlist += `#EXTINF:${CHUNK_DURATION}.0,\n`;
        playlist += `${chunk}\n`;
    }

    // Don't add ENDLIST while streaming (stream is still live)
    // ENDLIST will be added by finalize.js when stream ends

    // Write playlist
    const playlistPath = path.join(matchDir, 'playlist.m3u8');
    fs.writeFileSync(playlistPath, playlist);

    console.log(`[Watcher] Updated playlist for ${matchId}: ${chunks.length} chunks`);
}

/**
 * Scan all match directories and update playlists
 */
function scanAndUpdate() {
    if (!fs.existsSync(STORAGE_DIR)) {
        return;
    }

    const matches = fs.readdirSync(STORAGE_DIR)
        .filter(f => f.startsWith('match_'))
        .map(f => path.join(STORAGE_DIR, f))
        .filter(f => fs.statSync(f).isDirectory());

    for (const matchDir of matches) {
        updatePlaylist(matchDir);
    }
}

/**
 * Start watching for changes
 */
function startWatcher() {
    console.log('[Watcher] Starting HLS playlist watcher...');
    console.log(`[Watcher] Watching directory: ${STORAGE_DIR}`);

    // Initial scan
    scanAndUpdate();

    // Watch for changes every 5 seconds
    setInterval(scanAndUpdate, 5000);

    // Also use fs.watch for immediate updates
    if (fs.existsSync(STORAGE_DIR)) {
        fs.watch(STORAGE_DIR, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith('.webm') || filename.endsWith('.mp4'))) {
                // Debounce - wait a moment for file to be fully written
                setTimeout(() => {
                    const matchDir = path.join(STORAGE_DIR, path.dirname(filename));
                    if (fs.existsSync(matchDir)) {
                        updatePlaylist(matchDir);
                    }
                }, 500);
            }
        });
    }

    console.log('[Watcher] Watcher started successfully');
}

// Export for use as module
module.exports = {
    updatePlaylist,
    scanAndUpdate,
    startWatcher
};

// Run if executed directly
if (require.main === module) {
    startWatcher();

    // Keep process running
    process.on('SIGINT', () => {
        console.log('[Watcher] Shutting down...');
        process.exit(0);
    });
}
