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

// ==========================================
// REST Signaling API (for test pages)
// ==========================================
interface SignalQueue {
    host: any[]
    opponent: any[]
}

const signalQueues = new Map<string, SignalQueue>()

// Create room (no auth for testing)
app.post('/api/signaling/room/create', async (c) => {
    try {
        const { competition_id } = await c.req.json()
        const roomId = `comp_${competition_id}`

        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                hostSocket: null,
                opponentSocket: null,
                createdAt: Date.now()
            })
        }

        if (!signalQueues.has(roomId)) {
            signalQueues.set(roomId, { host: [], opponent: [] })
        }

        return c.json({
            success: true,
            data: {
                room_id: roomId,
                already_exists: rooms.has(roomId),
                host_joined: false,
                opponent_joined: false
            }
        })
    } catch (err: any) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// Join room
app.post('/api/signaling/room/join', async (c) => {
    try {
        const { room_id, role } = await c.req.json()

        if (!rooms.has(room_id)) {
            rooms.set(room_id, {
                id: room_id,
                hostSocket: null,
                opponentSocket: null,
                createdAt: Date.now()
            })
        }

        if (!signalQueues.has(room_id)) {
            signalQueues.set(room_id, { host: [], opponent: [] })
        }

        return c.json({
            success: true,
            data: {
                joined: true,
                role,
                host_joined: false,
                opponent_joined: true,
                viewer_count: 0
            }
        })
    } catch (err: any) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// Send signal
app.post('/api/signaling/signal', async (c) => {
    try {
        const { room_id, from_role, signal_type, signal_data } = await c.req.json()

        if (!signalQueues.has(room_id)) {
            signalQueues.set(room_id, { host: [], opponent: [] })
        }

        const queue = signalQueues.get(room_id)!
        const signal = { type: signal_type, data: signal_data, from: from_role }

        // Add to opposite role's queue
        if (from_role === 'host') {
            queue.opponent.push(signal)
        } else {
            queue.host.push(signal)
        }

        return c.json({ success: true })
    } catch (err: any) {
        return c.json({ success: false, error: err.message }, 400)
    }
})

// Poll for signals
app.get('/api/signaling/poll', (c) => {
    try {
        const room_id = c.req.query('room_id')
        const role = c.req.query('role')

        if (!room_id || !role) {
            return c.json({ success: false, error: 'Missing room_id or role' }, 400)
        }

        const queue = signalQueues.get(room_id)
        if (!queue) {
            return c.json({ success: true, data: { signals: [] } })
        }

        // Get signals for this role
        const signals = role === 'host' ? queue.host.splice(0) : queue.opponent.splice(0)

        return c.json({ success: true, data: { signals } })
    } catch (err: any) {
        return c.json({ success: false, error: err.message }, 400)
    }
})


const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, () => {
    console.log(`✅ Server running on port ${port}`)
})
