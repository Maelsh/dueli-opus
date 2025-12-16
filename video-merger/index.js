/**
 * Dueli Video Merger Server
 * سيرفر دمج فيديو ديولي
 * 
 * Main entry point that runs the HTTP server and HLS watcher
 */

const http = require('http');
const { startWatcher } = require('./watcher');

// Configuration
const PORT = process.env.PORT || 3000;

// Create simple HTTP server for health check
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Routes
    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'dueli-video-merger',
            version: '2.0.0',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Video Merger running on port ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/`);

    // Start HLS watcher
    startWatcher();
});

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    server.close(() => {
        console.log('[Server] Goodbye!');
        process.exit(0);
    });
});
