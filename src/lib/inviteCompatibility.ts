/**
 * UNIT35 / I-01 — normalize invite-panel compatibility scores for display.
 * Does not alter H7 weights or ranking; presentation only.
 */
import type { Language } from '../config/types';
import { t } from '../i18n';

export function formatInviteCompatibilityPercent(
    score: unknown,
    lang: Language
): { percent: number | null; label: string } {
    const unavailable = t('matchmaking.compatibility_unavailable', lang);
    if (score === null || score === undefined || score === '') {
        return { percent: null, label: unavailable };
    }
    const n = typeof score === 'number' ? score : Number(score);
    if (!Number.isFinite(n)) {
        return { percent: null, label: unavailable };
    }
    const percent = Math.min(Math.max(Math.round(n), 0), 100);
    return { percent, label: `${percent}%` };
}
