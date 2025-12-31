/**
 * HLS Playlist Watcher - Adaptive Version
 * يدعم القطع المتغيرة المدة والجودة
 */

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, 'storage', 'live');
const DEFAULT_DURATION = 10; // افتراضي
const SCAN_INTERVAL = 3000; // 3 ثوان

if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * قراءة مدة القطعة من metadata أو الملف نفسه
 */
function getChunkDuration(matchDir) {
    const metaFile = path.join(matchDir, 'metadata.json');
    if (fs.existsSync(metaFile)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            if (meta.segment_duration) {
                return meta.segment_duration / 1000; // تحويل من ms إلى ثواني
            }
        } catch (e) { }
    }
    return DEFAULT_DURATION;
}

/**
 * تحديث playlist لمنافسة معينة
 */
function updatePlaylist(matchDir) {
    const matchId = path.basename(matchDir);

    let chunks = [];
    try {
        const files = fs.readdirSync(matchDir);
        chunks = files
            .filter(f => f.startsWith('chunk_') && f.endsWith('.webm'))
            .sort();
    } catch (e) {
        return;
    }

    if (chunks.length === 0) return;

    // قراءة حالة الإنهاء
    const metaFile = path.join(matchDir, 'metadata.json');
    let isFinalized = false;
    let segmentDuration = DEFAULT_DURATION;

    if (fs.existsSync(metaFile)) {
        try {
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            isFinalized = meta.finalized === true;
            if (meta.segment_duration) {
                segmentDuration = meta.segment_duration / 1000;
            }
        } catch (e) { }
    }

    // إنشاء playlist
    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n';
    playlist += `#EXT-X-TARGETDURATION:${Math.ceil(segmentDuration)}\n`;
    playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
    playlist += '#EXT-X-PLAYLIST-TYPE:EVENT\n\n';

    for (const chunk of chunks) {
        playlist += `#EXTINF:${segmentDuration.toFixed(1)},\n`;
        playlist += `${chunk}\n`;
    }

    if (isFinalized) {
        playlist += '#EXT-X-ENDLIST\n';
    }

    // كتابة الملف
    const playlistPath = path.join(matchDir, 'playlist.m3u8');
    const existing = fs.existsSync(playlistPath) ? fs.readFileSync(playlistPath, 'utf8') : '';

    if (playlist !== existing) {
        fs.writeFileSync(playlistPath, playlist);
        console.log(`[Watcher] ${matchId}: ${chunks.length} chunks (${segmentDuration}s each)${isFinalized ? ' [END]' : ''}`);
    }
}

/**
 * مسح جميع المجلدات
 */
function scanAndUpdate() {
    if (!fs.existsSync(STORAGE_DIR)) return;

    try {
        const matches = fs.readdirSync(STORAGE_DIR)
            .filter(f => f.startsWith('match_') && f !== 'match_speedtest')
            .map(f => path.join(STORAGE_DIR, f))
            .filter(f => fs.statSync(f).isDirectory());

        for (const matchDir of matches) {
            updatePlaylist(matchDir);
        }
    } catch (e) {
        console.error('[Watcher] Error:', e.message);
    }
}

// بدء المراقبة
console.log('[Watcher] Starting adaptive HLS watcher...');
console.log(`[Watcher] Directory: ${STORAGE_DIR}`);
console.log(`[Watcher] Scan interval: ${SCAN_INTERVAL / 1000}s`);

scanAndUpdate();
setInterval(scanAndUpdate, SCAN_INTERVAL);

process.on('SIGINT', () => {
    console.log('[Watcher] Shutting down...');
    process.exit(0);
});
