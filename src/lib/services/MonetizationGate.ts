/**
 * MonetizationGate — UNIT41.1 public_monetization_enabled switch.
 *
 * The owner closed the public money/ads surfaces ('0' default) until the
 * launch procedures complete. While closed:
 *   - the gated PAGES render a friendly translated notice (HTTP 403), and
 *   - the gated APIs answer 403 with the same translated message,
 * for every caller EXCEPT the platform administration: session users with
 * `is_admin = 1`, or holders of any row in `admin_roles`
 * (AdminRoleModel). Admin and owner review flows are never interrupted.
 *
 * The switch lives in `platform_settings.public_monetization_enabled`
 * ('1' = open, anything else/missing = closed) and is flipped from /admin
 * without a deploy. The money semantics of whoever passes are unchanged.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';
import { AdminRoleModel } from '../../models/AdminRoleModel';
import { SessionModel } from '../../models/SessionModel';
import { readSessionCandidates } from './SessionCookieService';
import type { Bindings, Variables } from '../../config/types';

export const MONETIZATION_GATE_KEY = 'public_monetization_enabled';
export const DEMO_VIDEO_KEY = 'demo_explainer_video_url';

export async function isMonetizationOpen(db: D1Database): Promise<boolean> {
    const value = await new PlatformSettingsModel(db).getByKey(MONETIZATION_GATE_KEY);
    return value === '1';
}

/** Admin / role holders pass the gate even while it is closed. */
export async function canAccessMonetization(db: D1Database, user: { id: number; is_admin?: number | null } | null): Promise<boolean> {
    if (await isMonetizationOpen(db)) return true;
    if (!user) return false;
    if (Number(user.is_admin ?? 0) === 1) return true;
    const role = await new AdminRoleModel(db).findByUserId(user.id);
    return role !== null;
}

/** Resolve the session user from Bearer header or the HttpOnly cookie. */
async function resolveSessionUser(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<{ id: number; is_admin?: number | null } | null> {
    const candidates = readSessionCandidates(c as unknown as Parameters<typeof readSessionCandidates>[0]);
    for (const sessionId of candidates) {
        try {
            const session = await new SessionModel(c.env.DB).findValidSession(sessionId);
            const user = session?.user;
            if (user && typeof user.id === 'number') {
                return { id: user.id, is_admin: (user as { is_admin?: number | null }).is_admin ?? null };
            }
        } catch {
            // try the next candidate
        }
    }
    return null;
}

/**
 * Request-level gate decision used by both pages and API routers.
 * Never throws — on any infrastructure error the gate fails CLOSED for the
 * public (page/API refuse politely) while logging the cause.
 */
export async function canAccessMonetizationRequest(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<boolean> {
    try {
        if (await isMonetizationOpen(c.env.DB)) return true;
        const existing = c.get('user') as { id?: number; is_admin?: number | null } | null | undefined;
        if (existing && typeof existing.id === 'number') {
            return await canAccessMonetization(c.env.DB, { id: existing.id, is_admin: existing.is_admin ?? null });
        }
        const user = await resolveSessionUser(c);
        return await canAccessMonetization(c.env.DB, user);
    } catch (error) {
        console.error('[MonetizationGate] gate check failed, failing closed:', error);
        return false;
    }
}
