# Dueli Streaming Server

External WebRTC Signaling + TURN Server for Dueli Platform

## Quick Start

```bash
# Install
npm install

# Development
npm run dev

# Build
npm run build

# Production
npm start
# or with PM2:
pm2 start ecosystem.config.js
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
STREAMING_API_KEY=your-secret-key
PLATFORM_URL=https://project-8e7c178d.pages.dev
```

## Deployment

See `docs/deployment.md` for full deployment guide.

## Structure

```
streaming-server/
├── src/
│   └── index.ts       # Main server
├── config/
│   ├── turnserver.conf
│   └── apache.conf
├── .github/
│   └── workflows/
│       └── deploy.yml
└── package.json
```
