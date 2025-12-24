module.exports = {
    apps: [{
        name: 'streaming-server',
        script: 'dist/index.js',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        autorestart: true
    }]
}
