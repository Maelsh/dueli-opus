/**
 * monetizationGate — UNIT41.1 API middleware for the public money/ads
 * surface. Closed switch ('0', the seeded default) => every non-admin caller
 * gets 403 with the owner's exact translated sentence (project error
 * contract: { success: false, error: message }). Admins and AdminRoleModel
 * holders pass through. The Stripe webhook is never mounted behind this
 * middleware (it is the payment-completion authority, not a user surface).
 */

import { Context, Next } from 'hono';
import type { Bindings, Variables, Language } from '../config/types';
import { t, DEFAULT_LANGUAGE } from '../i18n';
import { canAccessMonetizationRequest } from '../lib/services/MonetizationGate';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export function monetizationGate() {
    return async (c: AppContext, next: Next) => {
        if (await canAccessMonetizationRequest(c)) return next();
        const lang = (c.get('lang') || DEFAULT_LANGUAGE) as Language;
        return c.json({ success: false, error: t('monetization_locked', lang) }, 403);
    };
}
