import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createNodeWebSocket } from '@hono/node-ws'
import 'dotenv/config'

interface Room {
    id: string
    hostSocket: any
    opponentSocket: any
    createdAt: number
}

const rooms = new Map<string, Room>()
const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// CORS
app.use('/*', cors({
    origin: [
        process.env.PLATFORM_URL || 'https://project-8e7c178d.pages.dev',
        'http://localhost:5173'
    ]
}))

// API Key middleware
const requireApiKey = async (c: any, next: any) => {
    const apiKey = c.req.header('X-Streaming-API-Key')
    if (apiKey !== process.env.STREAMING_API_KEY) {
        return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
}

// Health check
app.get('/health', (c) => {
    return c.json({ status: 'ok', uptime: process.uptime(), rooms: rooms.size })
})

// Room API
app.post('/api/room/create', requireApiKey, async (c) => {
    const { competitionId } = await c.req.json()
    const roomId = `comp_${competitionId}`

    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            hostSocket: null,
            opponentSocket: null,
            createdAt: Date.now()
        })
    }

    return c.json({
        success: true,
        roomId,
        signalingUrl: `wss://${c.req.header('host')}/signaling?room=${roomId}`
    })
})

// WebSocket
app.get('/signaling', upgradeWebSocket((c: any) => {
    const roomId = c.req.query('room')
    const role = c.req.query('role')

    return {
        onOpen(_evt: any, ws: any) {
            let room = rooms.get(roomId!)
            if (!room) {
                room = { id: roomId!, hostSocket: null, opponentSocket: null, createdAt: Date.now() }
                rooms.set(roomId!, room)
            }

            if (role === 'host') room.hostSocket = ws
            else if (role === 'opponent') room.opponentSocket = ws

            ws.send(JSON.stringify({ type: 'joined', roomId, role }))

            const other = role === 'host' ? room.opponentSocket : room.hostSocket
            if (other) other.send(JSON.stringify({ type: 'peer-joined', role }))
        },

        onMessage(evt: any, ws: any) {
            const data = JSON.parse(evt.data.toString())
            const room = rooms.get(roomId!)
            if (!room) return

            const currentRole = room.hostSocket === ws ? 'host' : 'opponent'
            const other = currentRole === 'host' ? room.opponentSocket : room.hostSocket

            if (other) other.send(JSON.stringify({ type: 'signal', ...data }))
        },

        onClose(_evt: any, ws: any) {
            const room = rooms.get(roomId!)
            if (!room) return

            const closedRole = room.hostSocket === ws ? 'host' : 'opponent'
            if (closedRole === 'host') room.hostSocket = null
            else room.opponentSocket = null

            const other = closedRole === 'host' ? room.opponentSocket : room.hostSocket
            if (other) other.send(JSON.stringify({ type: 'peer-left', role: closedRole }))

            if (!room.hostSocket && !room.opponentSocket) rooms.delete(roomId!)
        }
    }
}))

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, () => {
    console.log(`✅ Server running on port ${port}`)
})
