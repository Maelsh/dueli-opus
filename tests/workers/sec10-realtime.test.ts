/**
 * UNIT30.3 — SEC-10 behavioral guard.
 *
 * The AST checker proves `this.sockets` is absent and that the hibernation path
 * (`acceptWebSocket` + `getWebSockets`) is present. This test proves the
 * property: broadcast state must come from the Durable Object state, not from
 * an instance field. It is a plain unit test with a fake `DurableObjectState`
 * — no Wrangler/Miniflare, and it does not activate the realtime worker or
 * require REALTIME_WS_URL.
 */
import { describe, it, expect, vi } from 'vitest';
import { RealtimeRoom } from '../../workers/dueli-realtime/src/index';

const SECRET = 'sec10-publish-secret';

function fakeSocket() {
    return { send: vi.fn() };
}

function fakeState(sockets: Array<ReturnType<typeof fakeSocket>>) {
    return {
        getWebSockets: vi.fn(() => sockets),
        acceptWebSocket: vi.fn(),
    } as unknown as DurableObjectState;
}

function fakeEnv() {
    return { REALTIME_PUBLISH_SECRET: SECRET } as unknown as ConstructorParameters<typeof RealtimeRoom>[1];
}

function broadcast(room: RealtimeRoom, body: unknown, secret = SECRET) {
    return room.fetch(new Request('https://do/broadcast', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Publish-Secret': secret,
        },
        body: JSON.stringify(body),
    }));
}

describe('SEC-10 Durable Object hibernation-safe broadcast', () => {
    it('delivers to every live socket returned by state.getWebSockets()', async () => {
        const first = fakeSocket();
        const second = fakeSocket();
        const room = new RealtimeRoom(fakeState([first, second]), fakeEnv());

        const res = await broadcast(room, { event: 'tick', payload: { n: 1 }, id: 'evt-1' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ delivered: 2 });
        for (const socket of [first, second]) {
            expect(socket.send).toHaveBeenCalledTimes(1);
            const message = JSON.parse(socket.send.mock.calls[0][0]);
            expect(message).toMatchObject({ id: 'evt-1', event: 'tick', data: { n: 1 } });
        }
    });

    it('still delivers after a simulated hibernation wake-up (new instance, same state)', async () => {
        const socket = fakeSocket();
        const state = fakeState([socket]);

        const beforeHibernation = new RealtimeRoom(state, fakeEnv());
        expect((await broadcast(beforeHibernation, { event: 'before' })).status).toBe(200);

        // Cloudflare builds a NEW class instance after hibernation; connections
        // live in the Durable Object state, not in the previous instance.
        const afterHibernation = new RealtimeRoom(state, fakeEnv());
        const res = await broadcast(afterHibernation, { event: 'after' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ delivered: 1 });
        expect(socket.send).toHaveBeenCalledTimes(2);
        expect(JSON.parse(socket.send.mock.calls[1][0]).event).toBe('after');
    });

    it('counts only sockets that accept the message', async () => {
        const healthy = fakeSocket();
        const dead = fakeSocket();
        dead.send.mockImplementation(() => {
            throw new Error('closed');
        });
        const room = new RealtimeRoom(fakeState([healthy, dead]), fakeEnv());

        const res = await broadcast(room, { event: 'partial' });

        expect(await res.json()).toEqual({ delivered: 1 });
        expect(healthy.send).toHaveBeenCalledTimes(1);
        expect(dead.send).toHaveBeenCalledTimes(1);
    });

    it('requires the publish secret and an event body', async () => {
        const socket = fakeSocket();
        const room = new RealtimeRoom(fakeState([socket]), fakeEnv());

        const forbidden = await broadcast(room, { event: 'nope' }, 'wrong-secret');
        expect(forbidden.status).toBe(403);
        expect(socket.send).not.toHaveBeenCalled();

        const badRequest = await broadcast(room, { payload: {} });
        expect(badRequest.status).toBe(400);
        expect(socket.send).not.toHaveBeenCalled();
    });

    it('marks the handshake socket as hibernation-managed via acceptWebSocket', async () => {
        const sent: string[] = [];
        const clientSocket = {};
        const serverSocket = { send: (message: string) => { sent.push(message); } };
        class Pair {
            0 = clientSocket;
            1 = serverSocket;
        }
        class FakeResponse {
            status: number;
            webSocket: unknown;
            constructor(_body: unknown, init: { status?: number; webSocket?: unknown } = {}) {
                this.status = init.status ?? 200;
                this.webSocket = init.webSocket;
            }
        }
        vi.stubGlobal('WebSocketPair', Pair);
        vi.stubGlobal('Response', FakeResponse);
        try {
            const state = fakeState([]);
            const room = new RealtimeRoom(state, fakeEnv());

            const res = (await room.fetch(new Request('https://do/connect?channel=global'))) as unknown as {
                status: number;
                webSocket: unknown;
            };

            expect(res.status).toBe(101);
            expect(res.webSocket).toBe(clientSocket);
            expect(state.acceptWebSocket).toHaveBeenCalledTimes(1);
            expect(state.acceptWebSocket).toHaveBeenCalledWith(serverSocket);
            expect(sent).toHaveLength(1);
            expect(JSON.parse(sent[0])).toEqual({ type: 'connected', channel: 'global' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
