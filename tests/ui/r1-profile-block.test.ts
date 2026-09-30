/**
 * A — profile Block re-exposed through the EXISTING blocks contract.
 *
 * No new backend: the page reads GET /api/blocks for state and writes via
 * POST /api/blocks {user_id} and DELETE /api/blocks/:id — the exact contract
 * blocks/routes.ts already serves. Follow/Message contracts are untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { UserModel, CompetitionModel } from '../../src/models';
import { FollowModel } from '../../src/models/FollowModel';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);
const settle = () => new Promise((r) => setTimeout(r, 200));

async function seedSara(): Promise<FakeD1> {
    const db = new FakeD1();
    await new UserModel(db as unknown as D1Database).create({
        email: 'sara@test.com', username: 'sara', display_name: 'Sara Ahmed',
        bio: '', country: 'SA', language: 'ar',
    });
    vi.spyOn(CompetitionModel.prototype, 'findByUser').mockResolvedValue([]);
    vi.spyOn(FollowModel.prototype, 'getFollowersCount').mockResolvedValue(0 as never);
    vi.spyOn(FollowModel.prototype, 'getFollowingCount').mockResolvedValue(0 as never);
    return db;
}

async function runProfileActor(opts: { blocked: boolean; calls: { method: string; url: string; body?: string }[] }) {
    const db = await seedSara();
    const html = await (await app.request('/profile/sara?lang=ar', {}, env(db))).text();
    const h = createHarness({ ids: ['profileActions'], search: '?lang=ar' });
    (h.window as Record<string, unknown>).currentUser = { id: 9, username: 'omar' };
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
        setTimeout, clearTimeout, setInterval, clearInterval,
        URLSearchParams,
        localStorage: { getItem: () => 'sess-9', setItem: () => undefined, removeItem: () => undefined },
        confirm: () => true,
        checkAuth: async () => true,
        fetch: async (url: string, init?: { method?: string; body?: string }) => {
            opts.calls.push({ method: init?.method || 'GET', url, body: init?.body });
            if ((init?.method || 'GET') === 'GET') {
                return { ok: true, json: async () => ({ success: true, data: opts.blocked ? [{ blocked_id: 1 }] : [] }) };
            }
            return { ok: true, json: async () => ({ success: true, data: {} }) };
        },
    };
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'profileActions'), sandbox);
    h.fire('document', 'DOMContentLoaded');
    await settle();
    return { h, sandbox };
}

describe('A — profile block via the existing contract', () => {
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => { vi.restoreAllMocks(); (console.error as unknown as { mockRestore?: () => void }).mockRestore?.(); });

    it('other-profile actions show Follow + Message + Block (own-profile untouched)', async () => {
        const { h } = await runProfileActor({ blocked: false, calls: [] });
        const html = h.el('profileActions').innerHTML;
        expect(html).toContain('id="followBtn"');
        expect(html).toContain('/messages?user=');
        expect(html).toContain('id="blockBtn"');
    });

    it('unblocked state paints Block; toggle POSTs the existing contract', async () => {
        const calls: { method: string; url: string; body?: string }[] = [];
        const { h, sandbox } = await runProfileActor({ blocked: false, calls });
        // paintBlockButton mutates the lazily-registered button node (the shim
        // never parses innerHTML into nodes — same convention as grids).
        // 'Unblock' contains 'Block', so assert on the state icons instead.
        expect(h.el('blockBtn').innerHTML).toContain('fa-ban');
        runInNewContext('toggleBlock()', sandbox);
        await settle();
        const post = calls.find((c) => c.method === 'POST');
        expect(post?.url).toBe('/api/blocks');
        expect(post?.body).toContain('"user_id":1');
        expect(h.el('blockBtn').innerHTML).toContain('fa-check-circle');
    });

    it('blocked state paints Unblock; toggle DELETEs the existing contract', async () => {
        const calls: { method: string; url: string; body?: string }[] = [];
        const { h, sandbox } = await runProfileActor({ blocked: true, calls });
        expect(h.el('blockBtn').innerHTML).toContain('fa-check-circle');
        runInNewContext('toggleBlock()', sandbox);
        await settle();
        const del = calls.find((c) => c.method === 'DELETE');
        expect(del?.url).toBe('/api/blocks/1');
    });
});
