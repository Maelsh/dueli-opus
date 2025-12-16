/**
 * HLS Playlist Watcher (Shared Hosting Compatible)
 * مراقب قائمة تشغيل HLS (متوافق مع الاستضافة المشتركة)
 * 
 * Watches for new chunks and updates HLS playlist
 * Designed to run as a background process on shared hosting
 */

const fs = require('fs');
const path = require('path');

// Configuration
const STORAGE_DIR = path.join(__dirname, 'storage', 'live');
const CHUNK_DURATION = 10; // seconds per chunk
const SCAN_INTERVAL = 5000; // 5 seconds

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log('[Watcher] Created storage directory:', STORAGE_DIR);
}

/**
 * Update HLS playlist for a match
 * @param {string} matchDir - Path to match directory
 */
function updatePlaylist(matchDir) {
    const matchId = path.basename(matchDir);

    // Find all chunks (both webm and mp4)
    let chunks = [];
    try {
        const files = fs.readdirSync(matchDir);
        chunks = files
            .filter(f => f.startsWith('chunk_') && (f.endsWith('.webm') || f.endsWith('.mp4')))
            .sort();
    } catch (e) {
        console.error(`[Watcher] Error reading ${matchId}:`, e.message);
        return;
    }

    if (chunks.length === 0) {
        return; // No chunks yet
    }

    // Read metadata to check if stream ended
    const metaFile = path.join(matchDir, 'metadata.json');
    let isFinalized = false;
    if (fs.existsSync(metaFile)) {
        try {
            const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            isFinalized = metadata.finalized === true || metadata.finalize_started;
        } catch (e) { }
    }

    // Generate HLS playlist
    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n';
    playlist += `#EXT-X-TARGETDURATION:${CHUNK_DURATION}\n`;
    playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
    playlist += '#EXT-X-PLAYLIST-TYPE:EVENT\n\n';

    for (const chunk of chunks) {
        playlist += `#EXTINF:${CHUNK_DURATION}.0,\n`;
        playlist += `${chunk}\n`;
    }

    // Add ENDLIST if stream is finalized
    if (isFinalized) {
        playlist += '#EXT-X-ENDLIST\n';
    }

    // Write playlist
    const playlistPath = path.join(matchDir, 'playlist.m3u8');
    const existingPlaylist = fs.existsSync(playlistPath) ? fs.readFileSync(playlistPath, 'utf8') : '';

    // Only write if changed
    if (playlist !== existingPlaylist) {
        fs.writeFileSync(playlistPath, playlist);
        console.log(`[Watcher] Updated ${matchId}: ${chunks.length} chunks${isFinalized ? ' (ENDED)' : ''}`);
    }
}

/**
 * Scan all match directories and update playlists
 */
function scanAndUpdate() {
    if (!fs.existsSync(STORAGE_DIR)) {
        return;
    }

    try {
        const matches = fs.readdirSync(STORAGE_DIR)
            .filter(f => f.startsWith('match_'))
            .map(f => path.join(STORAGE_DIR, f))
            .filter(f => {
                try {
                    return fs.statSync(f).isDirectory();
                } catch (e) {
                    return false;
                }
            });

        for (const matchDir of matches) {
            updatePlaylist(matchDir);
        }
    } catch (e) {
        console.error('[Watcher] Scan error:', e.message);
    }
}

/**
 * Start watching for changes
 */
function startWatcher() {
    console.log('[Watcher] Starting HLS playlist watcher...');
    console.log(`[Watcher] Storage directory: ${STORAGE_DIR}`);
    console.log(`[Watcher] Scan interval: ${SCAN_INTERVAL / 1000}s`);

    // Initial scan
    scanAndUpdate();

    // Periodic scan (more reliable than fs.watch on shared hosting)
    setInterval(scanAndUpdate, SCAN_INTERVAL);

    console.log('[Watcher] Watcher started successfully');
    console.log('[Watcher] Press Ctrl+C to stop');
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
        console.log('\n[Watcher] Shutting down...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n[Watcher] Terminated');
        process.exit(0);
    });
}
