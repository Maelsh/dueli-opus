/**
 * @file tests/api/competition-lifecycle-i18n.test.ts
 * @description F-7 i18n remediation — competition lifecycle notification copy.
 *
 * Proves:
 *  1. Every user-facing lifecycle title/body resolves through the i18n system
 *     (t('notification.comp_*')) in both Arabic (RTL) and English (LTR) —
 *     single merged `notification` object in ar.ts/en.ts (no duplicate-key
 *     shadowing).
 *  2. ScheduledTaskService emits notifications via t() — no hardcoded
 *     English literals remain in the service (static pin).
 *  3. The stored snapshots stay English (t(key, 'en')), so Rule A/B/C
 *     lifecycle semantics, thresholds and SQL behavior are unchanged — and
 *     the Arabic pack carries the corrected meaning, notably
 *     notification.comp_deleted: the instant competition was deleted BECAUSE
 *     NO opponent joined within an hour.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t, translations } from '../../src/i18n';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

/** F-7: every user-facing lifecycle title/body key. */
const LIFECYCLE_I18N_KEYS = [
    'notification.comp_deleted_title',
    'notification.comp_deleted',
    'notification.comp_cancelled',
    'notification.comp_cancelled_no_opponent',
    'notification.comp_cancelled_not_started',
    'notification.comp_cancelled_generic',
    'notification.comp_ended_title',
    'notification.comp_ended',
    'notification.comp_reminder_title',
    'notification.comp_reminder',
] as const;

const EXPECTED_EN: Record<string, string> = {
    'notification.comp_deleted_title': 'Competition Deleted',
    'notification.comp_deleted':
        'Your instant competition was deleted because no opponent joined within 1 hour.',
    'notification.comp_cancelled': 'Competition Cancelled',
    'notification.comp_cancelled_no_opponent':
        'Your scheduled competition was cancelled because no opponent joined within 1 hour of the scheduled time.',
    'notification.comp_cancelled_not_started':
        'The scheduled competition was cancelled because it did not start within 1 hour of the scheduled time.',
    'notification.comp_cancelled_generic':
        'The competition was cancelled because it did not start in time.',
    'notification.comp_ended_title': 'Competition Ended',
    'notification.comp_ended':
        'The live competition was automatically ended after reaching the 2-hour maximum duration.',
    'notification.comp_reminder_title': 'Competition Reminder',
    'notification.comp_reminder': 'The competition will start soon!',
};

const EXPECTED_AR: Record<string, string> = {
    'notification.comp_deleted_title': 'تم حذف المنافسة',
    // Corrected meaning: deleted BECAUSE NO opponent joined within an hour.
    'notification.comp_deleted': 'تم حذف المنافسة الفورية لأنه لم ينضم منافس خلال ساعة.',
    'notification.comp_cancelled': 'تم إلغاء المنافسة',
    'notification.comp_cancelled_no_opponent':
        'تم إلغاء منافستك المجدولة لأنه لم ينضم منافس خلال ساعة من الموعد المحدد.',
    'notification.comp_cancelled_not_started':
        'تم إلغاء المنافسة المجدولة لأنها لم تبدأ خلال ساعة من الموعد المحدد.',
    'notification.comp_cancelled_generic': 'تم إلغاء المنافسة لأنها لم تبدأ في الوقت المحدد.',
    'notification.comp_ended_title': 'انتهت المنافسة',
    'notification.comp_ended':
        'انتهت المنافسة المباشرة تلقائيًا بعد الوصول إلى الحد الأقصى لمدة ساعتين.',
    'notification.comp_reminder_title': 'تذكير بالمنافسة',
    'notification.comp_reminder': 'ستبدأ المنافسة قريبًا!',
};

function resolveKey(key: string, lang: 'ar' | 'en'): string {
    const parts = key.split('.');
    let value: unknown = translations[lang];
    for (const part of parts) {
        if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[part];
        } else {
            return '';
        }
    }
    return typeof value === 'string' ? value : '';
}

describe('F-7 — competition lifecycle notification i18n', () => {
    describe('every lifecycle key exists in Arabic (ar)', () => {
        for (const key of LIFECYCLE_I18N_KEYS) {
            it(`ar: "${key}" resolves to a non-empty string`, () => {
                const value = resolveKey(key, 'ar');
                expect(value, `i18n key "${key}" must exist in ar.ts`).toBeTruthy();
                expect(value).not.toBe(key);
            });
        }
    });

    describe('every lifecycle key exists in English (en)', () => {
        for (const key of LIFECYCLE_I18N_KEYS) {
            it(`en: "${key}" resolves to a non-empty string`, () => {
                const value = resolveKey(key, 'en');
                expect(value, `i18n key "${key}" must exist in en.ts`).toBeTruthy();
                expect(value).not.toBe(key);
            });
        }
    });

    describe('Arabic and English translations differ', () => {
        for (const key of LIFECYCLE_I18N_KEYS) {
            it(`"${key}" has distinct ar/en values`, () => {
                const ar = resolveKey(key, 'ar');
                const en = resolveKey(key, 'en');
                expect(ar).toBeTruthy();
                expect(en).toBeTruthy();
                expect(ar).not.toBe(en);
            });
        }
    });

    describe('t() returns the exact pack strings', () => {
        for (const key of LIFECYCLE_I18N_KEYS) {
            it(`t("${key}", "en") is exact`, () => {
                expect(t(key, 'en')).toBe(EXPECTED_EN[key]);
            });
            it(`t("${key}", "ar") is exact`, () => {
                expect(t(key, 'ar')).toBe(EXPECTED_AR[key]);
            });
        }

        it('ar comp_deleted carries the negation (no opponent joined)', () => {
            const value = t('notification.comp_deleted', 'ar');
            expect(value).toContain('لم ينضم');
            expect(value).toContain('حذف');
        });
    });

    describe('single merged notification object (no duplicate-key shadowing)', () => {
        for (const [file, lang] of [['ar.ts', 'ar'], ['en.ts', 'en']] as const) {
            it(`${file} declares "notification:" exactly once`, () => {
                const src = readFileSync(join(process.cwd(), 'src', 'i18n', file), 'utf8');
                const occurrences = (src.match(/^\s*notification:\s*\{/gm) || []).length;
                expect(occurrences).toBe(1);
            });
            it(`${file} keeps the pre-existing notification keys (${lang})`, () => {
                expect(resolveKey('notification.system_notice', lang)).toBeTruthy();
                expect(resolveKey('notification.generic', lang)).toBeTruthy();
            });
        }
    });

    describe('ScheduledTaskService uses i18n (static pin)', () => {
        const src = readFileSync(
            join(process.cwd(), 'src', 'lib', 'services', 'ScheduledTaskService.ts'),
            'utf8'
        );

        it('imports t() from the i18n system', () => {
            expect(src).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]\.\.\/\.\.\/i18n['"]/);
        });

        for (const key of LIFECYCLE_I18N_KEYS) {
            it(`service resolves "${key}" via t()`, () => {
                expect(src).toContain(`t('${key}'`);
            });
        }

        it('contains no hardcoded lifecycle English literals', () => {
            const literals = [
                'Competition Deleted',
                'Competition Cancelled',
                'Competition Ended',
                'Competition Reminder',
                'Your instant competition was deleted because no opponent joined within 1 hour.',
                'Your scheduled competition was cancelled because no opponent joined within 1 hour of the scheduled time.',
                'The scheduled competition was cancelled because it did not start within 1 hour of the scheduled time.',
                'The competition was cancelled because it did not start in time.',
                'The live competition was automatically ended after reaching the 2-hour maximum duration.',
                'The competition will start soon!',
            ];
            for (const literal of literals) {
                // All user-facing copy must come from t('notification.…') — the
                // English pack holds the literal, the service must not.
                const occurrences = src.split(literal).length - 1;
                expect(occurrences, `hardcoded literal must not remain: "${literal}"`).toBe(0);
            }
        });
    });

    describe('stored snapshots stay English via t(key, "en") (behavior-preserving)', () => {
        const db = () => createSqliteD1() as unknown as D1Database;
        let d: D1Database;
        let svc: ScheduledTaskService;

        async function exec(sql: string) {
            await d.prepare(sql).run();
        }

        async function notesFor(userId: number): Promise<{ title: string; message: string }[]> {
            const r = (await d
                .prepare(`SELECT title, message FROM notifications WHERE user_id = ? ORDER BY id ASC`)
                .bind(userId)
                .all()) as any;
            return r.results as { title: string; message: string }[];
        }

        beforeEach(async () => {
            d = db();
            svc = new ScheduledTaskService(d);
            await exec(
                `INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (9001, 'a@test.local', 'a', 'x', 'A', 1);`
            );
            await exec(
                `INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (9002, 'b@test.local', 'b', 'x', 'B', 1);`
            );
            await exec(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (9001, 'c', 'C', 'C');`);
        });

        it('Rule A stores the i18n English snapshot', async () => {
            await exec(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, created_at) VALUES (101, 'i', 'r', 9001, 9001, NULL, 'pending', 'instant', datetime('now', '-2 hours'));`
            );
            await svc.expireInstantWithoutOpponent(101);
            const notes = await notesFor(9001);
            expect(notes).toHaveLength(1);
            expect(notes[0].title).toBe(t('notification.comp_deleted_title', 'en'));
            expect(notes[0].message).toBe(t('notification.comp_deleted', 'en'));
        });

        it('Rule B (no opponent) stores the i18n English snapshot', async () => {
            await exec(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (102, 's', 'r', 9001, 9001, NULL, 'pending', 'scheduled', datetime('now', '-2 hours'), datetime('now', '-2 hours'));`
            );
            await svc.cancelScheduledWithoutOpponent(102);
            const notes = await notesFor(9001);
            expect(notes).toHaveLength(1);
            expect(notes[0].title).toBe(t('notification.comp_cancelled', 'en'));
            expect(notes[0].message).toBe(t('notification.comp_cancelled_no_opponent', 'en'));
        });

        it('Rule B (not started) notifies both users with the i18n snapshot', async () => {
            await exec(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (103, 's', 'r', 9001, 9001, 9002, 'accepted', 'scheduled', datetime('now', '-2 hours'), datetime('now', '-2 hours'));`
            );
            await svc.cancelScheduledNotStarted(103);
            for (const userId of [9001, 9002]) {
                const notes = await notesFor(userId);
                expect(notes).toHaveLength(1);
                expect(notes[0].title).toBe(t('notification.comp_cancelled', 'en'));
                expect(notes[0].message).toBe(t('notification.comp_cancelled_not_started', 'en'));
            }
        });

        it('Rule C notifies both users with the i18n snapshot', async () => {
            await exec(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, started_at, created_at) VALUES (104, 'l', 'r', 9001, 9001, 9002, 'live', 'scheduled', datetime('now', '-2 hours', '-5 minutes'), datetime('now', '-3 hours'));`
            );
            const ended = await svc.endLiveMaxDuration(104, 2);
            expect(ended).toBe(true);
            for (const userId of [9001, 9002]) {
                const notes = await notesFor(userId);
                expect(notes).toHaveLength(1);
                expect(notes[0].title).toBe(t('notification.comp_ended_title', 'en'));
                expect(notes[0].message).toBe(t('notification.comp_ended', 'en'));
            }
        });

        it('reminder task stores the i18n English snapshot', async () => {
            await exec(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (105, 's', 'r', 9001, 9001, 9002, 'accepted', 'scheduled', datetime('now', '+1 hour'), datetime('now'));`
            );
            await exec(
                `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at) VALUES (105, 'send_reminder', datetime('now', '-1 minute'), 'pending', datetime('now'));`
            );
            const result = await svc.processPendingTasks();
            expect(result.processed).toBeGreaterThan(0);
            for (const userId of [9001, 9002]) {
                const notes = await notesFor(userId);
                expect(notes).toHaveLength(1);
                expect(notes[0].title).toBe(t('notification.comp_reminder_title', 'en'));
                expect(notes[0].message).toBe(t('notification.comp_reminder', 'en'));
            }
        });
    });
});
