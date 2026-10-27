/**
 * UNIT32.3 candidate — profile owner delete confirm/cancel and title fidelity
 * (SSR + load-more card HTML).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const env = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);
const SESSION = 'u32-3-del';
const OWNER = 32400;
const CAT = 3240;

const settle = () => new Promise((r) => setTimeout(r, 20));

function decodeHtmlAttr(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function buttonTagForId(html: string, competitionId: number): string | null {
    const re = new RegExp(`<button[^>]*data-owner-delete-btn="${competitionId}"[^>]*>`, 'i');
    return html.match(re)?.[0] ?? null;
}

function titleAttrFromTag(tag: string): string {
    const m = /data-comp-title="([^"]*)"/i.exec(tag);
    return m ? m[1] : '';
}

function attachProfileQuerySelector(h: ReturnType<typeof createHarness>, pageHtml: string): void {
    const doc = h.document as Record<string, unknown>;
    doc.querySelector = (sel: string) => {
        const m = /\[data-owner-delete-btn="(\d+)"\]/.exec(sel);
        if (m) {
            const id = Number(m[1]);
            const tag = buttonTagForId(pageHtml, id);
            if (!tag) return null;
            const encoded = titleAttrFromTag(tag);
            return {
                disabled: false,
                getAttribute(name: string) {
                    if (name === 'data-comp-title') return decodeHtmlAttr(encoded);
                    return null;
                },
                setAttribute() { /* noop */ },
                removeAttribute() { /* noop */ },
            };
        }
        const wrap = /\[data-owner-comp-wrap="(\d+)"\]/.exec(sel);
        if (wrap) {
            const id = wrap[1];
            const grid = h.el('profileCompetitionsGrid');
            return {
                remove() {
                    grid.innerHTML = grid.innerHTML.replace(
                        new RegExp(`<div class="flex flex-col" data-owner-comp-wrap="${id}"[^]*?</div>\\s*</div>`, 'i'),
                        '',
                    );
                },
            };
        }
        return null;
    };
}

async function bootOwnerProfile(db: SqliteD1, extraSql = ''): Promise<{
    html: string;
    h: ReturnType<typeof createHarness>;
    sandbox: Record<string, unknown>;
    fetches: Array<{ url: string; method?: string }>;
}> {
    const res = await app.request('/profile/del_owner?lang=en', {
        headers: { Authorization: `Bearer ${SESSION}` },
    }, env(db));
    const html = await res.text();
    const script = extractInlineScript(html, 'profileUsername');
    const fetches: Array<{ url: string; method?: string }> = [];
    const h = createHarness({
        ids: ['profileCompetitionsGrid', 'profileCompetitionsMore', 'profileCompetitionsState', 'profileCompetitionsRetry'],
        currentUser: { id: OWNER, username: 'del_owner' },
    });
    attachProfileQuerySelector(h, html);
    (h.window as any).dueli = { showToast: () => undefined };
    (h.window as any).DueliSession = { headers: () => ({ Authorization: `Bearer ${SESSION}` }) };
    (h.window as any).renderCompetitionCard = (item: { id: number; title: string }) =>
        `<div class="duel-card" data-competition-id="${item.id}">${item.title}</div>`;
    const fetchImpl = async (url: string, init?: { method?: string }) => {
        fetches.push({ url, method: init?.method || 'GET' });
        return app.request(url, {
            method: init?.method || 'GET',
            headers: { Authorization: `Bearer ${SESSION}`, 'Content-Type': 'application/json' },
        }, env(db));
    };
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined, warn: () => undefined },
        localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        JSON,
        Date,
        Number,
        Math,
        Intl,
        URLSearchParams,
        encodeURIComponent,
        decodeURIComponent,
        alert: () => undefined,
        checkAuth: async () => true,
        authStatus: () => 'authenticated',
        fetch: fetchImpl,
        confirm: () => false,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);
    return { html, h, sandbox, fetches };
}

function seedBase(db: SqliteD1): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${OWNER}, 'del@test.local', 'del_owner', 'x', 'Del Owner', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (${CAT}, 'd32', 'D', 'D');
        INSERT INTO sessions (id, user_id, expires_at) VALUES ('${SESSION}', ${OWNER}, datetime('now', '+1 day'));
    `);
}

describe('UNIT32.3 candidate — profile delete title + confirm behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { label: 'double-quote and specials', title: 'Say "hello" & bye <test>' },
        { label: 'single-quote', title: "O'Brien's final" },
    ])('SSR encodes $label in data-comp-title without breaking CSP args', async ({ title }) => {
        const db = createSqliteD1();
        seedBase(db);
        const esc = title.replace(/'/g, "''");
        db.exec(`
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type)
            VALUES (32401, '${esc}', 'r', ${CAT}, ${OWNER}, NULL, 'pending', 'instant');
        `);
        const html = await (await app.request('/profile/del_owner?lang=en', {
            headers: { Authorization: `Bearer ${SESSION}` },
        }, env(db))).text();
        const tag = buttonTagForId(html, 32401);
        expect(tag).toBeTruthy();
        expect(tag).toContain("data-csp-args='[32401]'");
        expect(decodeHtmlAttr(titleAttrFromTag(tag!))).toBe(title);
    });

    it('confirm dialog uses the decoded title; cancel skips DELETE', async () => {
        const db = createSqliteD1();
        seedBase(db);
        const title = 'Say "delete" & stop';
        db.exec(`
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type)
            VALUES (32402, '${title.replace(/'/g, "''")}', 'r', ${CAT}, ${OWNER}, NULL, 'pending', 'instant');
        `);
        const { sandbox, fetches } = await bootOwnerProfile(db);
        let confirmBody = '';
        (sandbox as any).confirm = (msg: string) => {
            confirmBody = msg;
            return false;
        };
        await (sandbox as any).confirmDeleteOwnerCompetition(32402);
        expect(confirmBody).toContain(title);
        expect(fetches.some((f) => f.method === 'DELETE')).toBe(false);
    });

    it('confirm accepts eligible competition and sends DELETE', async () => {
        const db = createSqliteD1();
        seedBase(db);
        db.exec(`
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type)
            VALUES (32403, 'Gone', 'r', ${CAT}, ${OWNER}, NULL, 'pending', 'instant');
        `);
        const { sandbox, fetches } = await bootOwnerProfile(db);
        (sandbox as any).confirm = () => true;
        await (sandbox as any).confirmDeleteOwnerCompetition(32403);
        await settle();
        expect(fetches.filter((f) => f.method === 'DELETE').map((f) => f.url)).toContain('/api/competitions/32403');
    });

    it('load-more appended card preserves escaped title and CSP args', async () => {
        const db = createSqliteD1();
        seedBase(db);
        const special = `Page2 ' " & <>`;
        for (let i = 1; i <= 22; i++) {
            const id = 32500 + i;
            const t = i === 1 ? special : `Comp ${i}`;
            const ts = `2026-02-${String(Math.min(i, 28)).padStart(2, '0')} 10:00:00`;
            db.exec(`
                INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, created_at, competition_type)
                VALUES (${id}, '${t.replace(/'/g, "''")}', 'r', ${CAT}, ${OWNER}, NULL, 'pending', '${ts}', 'instant');
            `);
        }
        const { h, sandbox, fetches } = await bootOwnerProfile(db);
        h.fire('document', 'DOMContentLoaded');
        await settle();
        const beforeLen = fetches.length;
        await (sandbox as any).loadMoreProfileCompetitions();
        await settle();
        expect(fetches.length).toBeGreaterThan(beforeLen);
        const appended = h.el('profileCompetitionsGrid').appendLog.join('');
        expect(appended).toContain('data-csp-args="[32501]"');
        expect(appended).toContain('&#39;');
        expect(appended).toContain('&quot;');
        expect(appended).toContain('&lt;&gt;');
        expect(appended).not.toMatch(/data-csp-args='\[\d+,\s*"/);
    });
});
