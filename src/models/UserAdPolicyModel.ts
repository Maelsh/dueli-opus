import { D1Database } from '@cloudflare/workers-types';

/**
 * UNIT36.1 competitor ad control.
 *
 * One mode per user:
 * - auto   : current behavior; third-party ads serve unless the competitor has
 *            blocked that specific ad (ad_blocks). House ads always serve.
 * - allow  : explicit permission for third-party ads. Per-ad blocks still win
 *            and house ads are still never blockable.
 * - manual : only third-party ads explicitly granted by this competitor.
 * - block  : no third-party ads at all; house ads still serve.
 *
 * Modes are scoped to the session user. No route accepts another user's id.
 */
export const AD_POLICY_MODES = ['auto', 'allow', 'manual', 'block'] as const;
export type AdPolicyMode = typeof AD_POLICY_MODES[number];

export interface AdGrantCandidate {
    id: number;
    title: string;
    image_url: string | null;
    media_kind: string;
    duration_sec: number | null;
    granted: number;
}

export class UserAdPolicyModel {
    constructor(private db: D1Database) {}

    async getMode(userId: number): Promise<AdPolicyMode> {
        const row = await this.db.prepare(
            'SELECT mode FROM user_ad_policy WHERE user_id = ?'
        ).bind(userId).first<{ mode: AdPolicyMode }>();
        return row?.mode || 'auto';
    }

    async setMode(userId: number, mode: AdPolicyMode): Promise<void> {
        await this.db.prepare(`
            INSERT INTO user_ad_policy (user_id, mode, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, updated_at = datetime('now')
        `).bind(userId, mode).run();
    }

    async grant(userId: number, adId: number): Promise<void> {
        await this.db.prepare(`
            INSERT INTO user_ad_grants (user_id, ad_id, created_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id, ad_id) DO NOTHING
        `).bind(userId, adId).run();
    }

    async revoke(userId: number, adId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'DELETE FROM user_ad_grants WHERE user_id = ? AND ad_id = ?'
        ).bind(userId, adId).run();
        return (result.meta?.changes ?? 0) > 0;
    }

    async listGrantIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(
            'SELECT ad_id FROM user_ad_grants WHERE user_id = ? ORDER BY ad_id'
        ).bind(userId).all<{ ad_id: number }>();
        return (result.results || []).map((row) => Number(row.ad_id));
    }

    /**
     * Third-party paid ads a competitor may approve in manual mode.
     * Same active/budget gate as serving; house rows are never listed because
     * they cannot be blocked or granted.
     */
    async listCandidates(userId: number): Promise<AdGrantCandidate[]> {
        const result = await this.db.prepare(`
            SELECT a.id, a.title, a.image_url, COALESCE(a.media_kind, 'image') AS media_kind,
                   a.duration_sec,
                   CASE WHEN g.ad_id IS NULL THEN 0 ELSE 1 END AS granted
            FROM advertisements a
            LEFT JOIN user_ad_grants g ON g.ad_id = a.id AND g.user_id = ?
            WHERE COALESCE(a.is_house, 0) = 0
              AND a.is_active = 1
              AND (CASE WHEN a.campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                    THEN a.campaign_lifecycle_status ELSE a.campaign_status END) = 'active'
              AND (
                SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                FROM ledger_entries
                WHERE account = 'reserve:campaign_' || a.id
              ) >= a.cost_per_impression_cents
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 50
        `).bind(userId).all<AdGrantCandidate>();
        return result.results || [];
    }
}
