/**
 * UNIT41.2-P1 (G4) — server-side create dedup (idempotent competitions).
 *
 * Contract under test:
 * - CompetitionModel.create runs ONE atomic `INSERT ... SELECT ... WHERE
 *   NOT EXISTS` on (creator_id + title + category_id) for pending rows
 *   without an opponent inside a 10-minute window — the loser of a race
 *   (double click, retry, concurrent request) reads back the winner row
 *   and returns it instead of inserting a duplicate.
 * - POST /api/competitions through CompetitionController keeps 201 and the
 *   SAME id for the duplicate; a different title (or category) is a
 *   genuinely different competition and IS allowed even in-flight.
 * - The dedup never applies once an opponent joined or the window lapsed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 700;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'g4-create-test',
        'Idempotency-Key': 'g4-create-test-key',
        'CF-Connecting-IP': `10.7.7.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function postCreate(
    db: SqliteD1, body: Record<string, unknown>, token: string,
): Promise<{ status: number; data: { id?: number; title?: string } | null }> {
    const res = await app.request('/api/competitions?lang=ar', {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(body),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: { id?: number; title?: string } | null };
    return { status: res.status, data: json.success ? json.data : null };
}

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@g4.local', 'creatorg4', 'x', 'Creator G4', 1, 'ar', 'SA'),
         (3, 'other@g4.local', 'otherg4', 'x', 'Other G4', 1, 'ar', 'SA'),
         (4, 'opponent@g4.local', 'opponentg4', 'x', 'Opponent G4', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-g4-user2', 2, datetime('now', '+1 day')),
         ('sess-g4-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL)`,
    ).run();
}

interface CreateData {
    title: string;
    category_id: number;
    rules: string;
    creator_id: number;
    language?: string;
    competition_type?: 'instant' | 'scheduled';
}

function baseData(creatorId: number, title = 'G4 duplicate probe', categoryId = 10): CreateData {
    return { title, category_id: categoryId, rules: 'r', creator_id: creatorId, language: 'ar' };
}

async function countRows(db: SqliteD1, title: string): Promise<number> {
    return (await db.prepare(`SELECT COUNT(*) AS n FROM competitions WHERE title = ?`).bind(title)
        .first<{ n: number }>())?.n ?? 0;
}

describe('UNIT41.2-P1 G4 — atomic create dedup keeps ONE pending row', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. a single create inserts exactly one pending row ', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        const created = await model.create(baseData(2));
        expect(created.id).toBeTruthy();
        expect(created.status).toBe('pending');
        expect(await countRows(db, 'G4 duplicate probe')).toBe(1);
    });

    it('2. a sequential duplicate returns the SAME id and does not insert again', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        const first = await model.create(baseData(2));
        const second = await model.create(baseData(2));
        expect(second.id).toBe(first.id);
        expect(await countRows(db, 'G4 duplicate probe')).toBe(1);
        // The winner row is returned as-is (title unchanged, still pending).
        expect(second.title).toBe(first.title);
        expect(second.status).toBe('pending');
    });

    it('3. a concurrent duplicate loses the race and still yields exactly 1 row', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        // The shim serializes statements like D1; the atomic INSERT..WHERE
        // NOT EXISTS is what makes the loser return the winner's row.
        const results = await Promise.all([
            model.create(baseData(2)),
            model.create(baseData(2)),
        ]);
        const ids = new Set(results.map((r) => r.id as number));
        expect(ids.size).toBe(1);
        expect(await countRows(db, 'G4 duplicate probe')).toBe(1);
    });

    it('4. a different title or category is a different competition (allowed)', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        await model.create(baseData(2, 'G4 first probe', 10));
        await model.create(baseData(2, 'G4 second probe', 10));
        await model.create(baseData(2, 'G4 first probe', 11));
        expect(await countRows(db, 'G4 first probe')).toBe(2);
        expect(await countRows(db, 'G4 second probe')).toBe(1);
    });

    it('5. a different creator is never deduped together', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        await model.create(baseData(2, 'G4 shared title'));
        await model.create(baseData(3, 'G4 shared title'));
        expect(await countRows(db, 'G4 shared title')).toBe(2);
    });

    it('6. the dedup window lapses after 10 minutes (recreate allowed)', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        const stale = await model.create(baseData(2, 'G4 aged probe'));
        await db.prepare(
            `UPDATE competitions SET created_at = datetime('now', '-11 minutes') WHERE id = ?`,
        ).bind(stale.id).run();
        const retry = await model.create(baseData(2, 'G4 aged probe'));
        expect(retry.id).not.toBe(stale.id);
        expect(await countRows(db, 'G4 aged probe')).toBe(2);
    });

    it('7. once an opponent joined, the placeholder can spawn a new create', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        const joined = await model.create(baseData(2, 'G4 joined probe'));
        await db.prepare(`UPDATE competitions SET opponent_id = 4 WHERE id = ?`).bind(joined.id).run();
        const retry = await model.create(baseData(2, 'G4 joined probe'));
        expect(retry.id).not.toBe(joined.id);
        expect((await countRows(db, 'G4 joined probe'))).toBe(2);
    });

    it('8. POST /api/competitions returns 201 + same id for a flagged duplicate', async () => {
        const body = { title: 'G4 controller probe', rules: 'r', category_id: 10, language: 'ar' };
        const first = await postCreate(db, body, 'sess-g4-user2');
        expect(first.status).toBe(201);
        expect(first.data?.id).toBeTruthy();
        const second = await postCreate(db, body, 'sess-g4-user2');
        expect(second.status).toBe(201);
        expect(second.data?.id).toBe(first.data?.id);
        expect(await countRows(db, 'G4 controller probe')).toBe(1);
    });

    it('9. CompetitionModel.create keeps the atomic NOT EXISTS dedup guard', () => {
        const src = readFileSync(join(process.cwd(), 'src/models/CompetitionModel.ts'), 'utf-8');
        expect(src).toMatch(/INSERT INTO competitions[\s\S]*WHERE NOT EXISTS/);
        expect(src).toMatch(/created_at > datetime\('now', '-10 minutes'\)/);
        expect(src).toMatch(/status = 'pending'[\s\S]*opponent_id IS NULL/);
    });

    it('10. create-page (G4 client half) freezes the form on redirect and sends a stable key', () => {
        const src = readFileSync(join(process.cwd(), 'src/modules/pages/create-page.ts'), 'utf-8');
        // The redirect flag is set BEFORE the redirect and the finally block
        // early-returns so it never re-enables the submit button.
        expect(src).toMatch(/createRedirecting = true;/);
        expect(src).toMatch(/if \(createRedirecting\) return;/);
        expect(src).toMatch(/if \(createSubmitting \|\| createRedirecting\) return;/);
        // A stable per-attempt key rides the request (WebCrypto, no Math.random()).
        expect(src).toMatch(/'Idempotency-Key':\s*ensureCreateIdempotencyKey\(\)/);
        expect(src).toMatch(/crypto\.randomUUID\(\)/);
        expect(src).not.toMatch(/Math\.random\(\)/);
        // A late auth event never wipes an already-rendered form.
        expect(src).toMatch(/if \(formRendered && document\.getElementById\('createForm'\)\)/);
    });

    it('11. a dedup-hit create does not duplicate the auto_delete_if_not_live task row', async () => {
        const body = { title: 'G4 task dedup probe', rules: 'r', category_id: 10, language: 'ar' };
        const first = await postCreate(db, body, 'sess-g4-user2');
        expect(first.status).toBe(201);
        expect(first.data?.id).toBeTruthy();

        // The duplicate is a dedup-hit: the SAME pending competition is
        // returned, so its lifecycle task must not be scheduled twice.
        const second = await postCreate(db, body, 'sess-g4-user2');
        expect(second.status).toBe(201);
        expect(second.data?.id).toBe(first.data?.id);
        expect(await countRows(db, 'G4 task dedup probe')).toBe(1);

        const tasks = await db.prepare(
            `SELECT COUNT(*) AS n FROM competition_scheduled_tasks
             WHERE competition_id = ? AND task_type = 'auto_delete_if_not_live' AND status = 'pending'`,
        ).bind(first.data?.id).first<{ n: number }>();
        expect(tasks?.n).toBe(1);
    });

    it('12. the create path schedules the lifecycle task idempotently', () => {
        const service = readFileSync(join(process.cwd(), 'src/lib/services/ScheduledTaskService.ts'), 'utf-8');
        // The idempotent scheduler inserts only when no pending row exists.
        expect(service).toMatch(/scheduleIfAbsent\(/);
        expect(service).toMatch(/INSERT INTO competition_scheduled_tasks[\s\S]*?WHERE NOT EXISTS/);

        const controller = readFileSync(join(process.cwd(), 'src/controllers/CompetitionController.ts'), 'utf-8');
        // create() schedules auto_delete_if_not_live through it (both branches).
        expect((controller.match(/taskService\.scheduleIfAbsent\(/g) ?? []).length).toBe(2);
        // The explicit lifecycle transitions keep the plain scheduler.
        expect((controller.match(/taskService\.schedule\(/g) ?? []).length).toBe(2);
    });
});
