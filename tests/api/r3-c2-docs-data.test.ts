/**
 * R3-C2 — admin-managed documents/data for the C2 content surface.
 *
 * Forensic position: R2-A already ships the store + admin CRUD + public
 * by-slug read + dashboard UI + tagged seeds. This suite pins the genuine
 * C2 gaps only:
 * - public index (GET /api/documents) listing published+public metadata;
 * - C2 category placeholders manageable through the same system
 *   (project-message, product-overview, engineering-notes, open-source,
 *   ai-credits, legal-terms-draft) — draft/private tagged seeds whose bodies
 *   state plainly that real content comes from the owner later and claim NO
 *   completed legal entity, banking, KYC, provider or launch approval.
 *
 * Contract: admin-only writes (401/403 otherwise), draft-vs-published and
 * public-vs-private enforced on both API and pages, ar/en bodies, public
 * 404 with no existence oracle, audit rows, no R2-A regression.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 42000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3c2-test',
        'CF-Connecting-IP': `10.44.44.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function api(db: SqliteD1, method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(`${path}${path.includes('?') ? '&' : '?'}lang=en`, {
        method,
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

const C2_SLUGS = [
    'seed-project-message',
    'seed-product-overview',
    'seed-engineering-notes',
    'seed-open-source',
    'seed-ai-credits',
    'seed-legal-terms-draft',
];

describe('R3-C2 admin-managed C2 documents', () => {
    let db: SqliteD1;
    let adminTok = '';
    let plainTok = '';

    beforeEach(async () => {
        db = await createSqliteD1();
        const adminHash = await CryptoUtils.hashPassword('admin');
        const userHash = await CryptoUtils.hashPassword('userpass1');
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
             (2, 'admin@c2.local', 'admin', '${adminHash}', 'Administrator', 1, 1, 0),
             (4, 'plain@c2.local', 'plain_user', '${userHash}', 'Plain User', 1, 0, 0)`,
        ).run();
        await db.prepare(`INSERT INTO admin_roles (user_id, role, granted_by) VALUES (2, 'SuperAdmin', 2)`).run();
        const login = async (email: string, password: string) => {
            const res = await app.request('/api/auth/login?lang=en', {
                method: 'POST', headers: headers(), body: JSON.stringify({ email, password }),
            }, env(db));
            return (await res.json() as any).data.sessionId as string;
        };
        adminTok = await login('admin@c2.local', 'admin');
        plainTok = await login('plain@c2.local', 'userpass1');
    });

    it('1. admin-only writes: anon and plain user are refused', async () => {
        const payload = { slug: 'c2-nope', title_ar: 'س', title_en: 'Nope' };
        expect((await api(db, 'POST', '/api/admin/documents', undefined, payload)).status).toBe(403);
        expect((await api(db, 'POST', '/api/admin/documents', plainTok, payload)).status).toBe(403);
        const created = await api(db, 'POST', '/api/admin/documents', adminTok, payload);
        expect(created.status).toBe(201);
        expect(created.data.data.document.slug).toBe('c2-nope');
    });

    it('2. C2 category doc: create draft/private by default, edit ar/en, publish flow bumps version', async () => {
        const created = await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'project-message', title_ar: 'رسالة المشروع', title_en: 'Project message',
            body_ar: 'نص عربي', body_en: 'English text',
        });
        expect(created.status).toBe(201);
        const doc = created.data.data.document;
        expect(doc.status).toBe('draft');
        expect(doc.visibility).toBe('private');
        expect(doc.version).toBe(1);
        // Admin preview read sees the draft content in both languages.
        const preview = await api(db, 'GET', `/api/admin/documents/${doc.id}`, adminTok);
        expect(preview.status).toBe(200);
        expect(preview.data.data.document.body_ar).toBe('نص عربي');
        expect(preview.data.data.document.body_en).toBe('English text');
        // Edit + publish + public in steps; every update bumps the version.
        const edited = await api(db, 'PUT', `/api/admin/documents/${doc.id}`, adminTok, { body_en: 'English text v2' });
        expect(edited.data.data.document.version).toBe(2);
        const published = await api(db, 'PUT', `/api/admin/documents/${doc.id}`, adminTok, { status: 'published', visibility: 'public' });
        expect(published.data.data.document.version).toBe(3);
        expect(published.data.data.document.status).toBe('published');
    });

    it('3. public index lists only published+public metadata, never bodies of hidden docs', async () => {
        const pub = await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'open-source', title_ar: 'المصدر المفتوح', title_en: 'Open source',
            status: 'published', visibility: 'public',
        });
        expect(pub.status).toBe(201);
        await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'ai-credits', title_ar: 'مساهمات', title_en: 'Credits',
        });
        const index = await api(db, 'GET', '/api/documents', undefined);
        expect(index.status).toBe(200);
        const slugs = (index.data.data.documents as Array<{ slug: string }>).map((d) => d.slug);
        expect(slugs).toContain('open-source');
        expect(slugs).not.toContain('ai-credits');
        const entry = (index.data.data.documents as Array<Record<string, unknown>>)[0];
        expect(Object.keys(entry).sort()).toEqual(['id', 'slug', 'title_ar', 'title_en', 'updated_at', 'version']);
    });

    it('4. public read: published+public 200 ar/en; draft/private/missing 404 with no oracle', async () => {
        const created = await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'engineering-notes', title_ar: 'ملاحظات هندسية', title_en: 'Engineering notes',
            body_ar: 'ع', body_en: 'E', status: 'published', visibility: 'public',
        });
        expect(created.status).toBe(201);
        const read = await api(db, 'GET', '/api/documents/engineering-notes', undefined);
        expect(read.status).toBe(200);
        expect(read.data.data.document.title_ar).toBe('ملاحظات هندسية');
        expect(read.data.data.document.title_en).toBe('Engineering notes');
        await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'secret-draft', title_ar: 'سري', title_en: 'Secret',
        });
        expect((await api(db, 'GET', '/api/documents/secret-draft', undefined)).status).toBe(404);
        await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'pub-but-private', title_ar: 'خ', title_en: 'X', status: 'published', visibility: 'private',
        });
        expect((await api(db, 'GET', '/api/documents/pub-but-private', undefined)).status).toBe(404);
        expect((await api(db, 'GET', '/api/documents/does-not-exist', undefined)).status).toBe(404);
    });

    it('5. publish/unpublish and delete keep the public surface truthful, with audit', async () => {
        const created = await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'product-overview', title_ar: 'نظرة', title_en: 'Overview',
            status: 'published', visibility: 'public',
        });
        const id = created.data.data.document.id as number;
        expect((await api(db, 'GET', '/api/documents/product-overview', undefined)).status).toBe(200);
        await api(db, 'PUT', `/api/admin/documents/${id}`, adminTok, { status: 'draft' });
        expect((await api(db, 'GET', '/api/documents/product-overview', undefined)).status).toBe(404);
        const del = await api(db, 'DELETE', `/api/admin/documents/${id}`, adminTok);
        expect(del.status).toBe(200);
        const actions = await db.prepare(
            `SELECT action_type FROM admin_audit_logs WHERE admin_id = 2 ORDER BY id ASC`,
        ).all<{ action_type: string }>();
        const names = (actions.results ?? []).map((r) => r.action_type);
        expect(names).toContain('document_created');
        expect(names).toContain('document_unpublished');
        expect(names).toContain('document_deleted');
    });

    it('6. shipped C2 seeds are tagged placeholders that claim nothing real', async () => {
        const seed = readFileSync(resolve(__dirname, '../../db/seed.sql'), 'utf-8');
        for (const slug of C2_SLUGS) {
            expect(seed, `seed row ${slug}`).toContain(`('${slug}'`);
        }
        // Every C2 seed row is draft/private with is_seed = 1.
        const c2Lines = seed.split('\n').filter((l) => C2_SLUGS.some((s) => l.includes(`('${s}'`)));
        expect(c2Lines.length).toBe(C2_SLUGS.length);
        for (const line of c2Lines) {
            expect(line, 'tagged').toMatch(/\[SEED\]/);
            expect(line, 'draft').toContain(`'draft'`);
            expect(line, 'private').toContain(`'private'`);
            expect(line, 'is_seed').toContain(', 1, 1, NULL, NULL)');
        }
        // No completion claims about legal entity / banking / KYC / approvals.
        for (const forbidden of ['مكتملة', 'completed entity', 'KYC approved', 'bank account opened', 'licensed', 'مرخص']) {
            expect(seed, `forbidden claim ${forbidden}`).not.toContain(forbidden);
        }
        // Placeholder honesty is explicit in the bodies themselves.
        expect(seed).toContain('NOT a legal document');
        expect(seed).toContain('ليست وثيقة قانونية');
    });
});
