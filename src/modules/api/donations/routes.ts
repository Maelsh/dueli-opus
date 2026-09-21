/**
 * @file src/modules/api/donations/routes.ts
 * @description مسارات التبرعات
 * @module api/donations/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { DonationModel } from '../../../models/DonationModel';
import { UserModel } from '../../../models/UserModel';
import { CompetitionModel } from '../../../models/CompetitionModel';
import { PlatformSettingsModel } from '../../../models/PlatformSettingsModel';
import { splitDonationCents } from '../../../models/DonationModel';
import { EventPusher } from '../../../lib/services/EventPusher';
import { authMiddleware } from '../../../middleware/auth';
import { t } from '../../../i18n';
import type { Language } from '../../../config/types';
import type { StripeEventShape } from '../../../lib/services/StripeWebhookService';

const donationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Optional auth on every route in this router: donations can be made
// anonymously, but when a session is present we attach the user.
// NOTE (SEC-01 closed, 8.G): there is NO manual completion route — the Stripe
// webhook (POST /api/donations/webhook) is the only payment completion
// authority. No client may ever set payment_status → completed.
donationsRoutes.use('*', authMiddleware({ required: false }));

/**
 * GET /api/donations/top-supporters
 * Get top supporters list
 */
donationsRoutes.get('/top-supporters', async (c) => {
    try {
        const donationModel = new DonationModel(c.env.DB);
        const supporters = await donationModel.getTopSupporters(10);

        return c.json({
            success: true,
            data: supporters
        });
    } catch (error) {
        console.error('Get top supporters error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get top supporters' }
        }, 500);
    }
});

/**
 * GET /api/donations/total
 * Get total donations amount
 */
donationsRoutes.get('/total', async (c) => {
    try {
        const donationModel = new DonationModel(c.env.DB);
        const total = await donationModel.getTotalDonations();

        return c.json({
            success: true,
            data: { total }
        });
    } catch (error) {
        console.error('Get total donations error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get total donations' }
        }, 500);
    }
});

/**
 * POST /api/donations
 * Create a new donation (initiates payment)
 *
 * 8.E: يقبل `competitor_id` (المتنافس المستلم) و`competition_id` (سياق البث
 * اختياري) — بلا أي حساب رسوم في المسار أو العميل (التقسيم integer-cents
 * عند نجاح الدفع فقط عبر LedgerService). بلا مستلم = تبرع للمنصة (8.C).
 */
donationsRoutes.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { amount, payment_method, donor_name, donor_email, message, is_anonymous, competitor_id, competition_id } = body;
        const lang = (c.get('lang') || 'en') as Language;
        const donationModel = new DonationModel(c.env.DB);

        // Validate amount — 8.E: الحد الأدنى الموثق $1، ولا حد أقصى على
        // مستوى Dueli (أي مبلغ فوق ذلك يمرّ للبوابة ورفضها آمن بلا قيود).
        const checked = donationModel.validateAmountCents(amount);
        if (!checked.ok) {
            return c.json({
                success: false,
                error: { message: checked.error === 'below_minimum' ? t('donations.min', lang) : t('payment_min_amount', lang) }
            }, 400);
        }

        // Validate payment method (paypal hidden until a real integration exists)
        const validMethods = ['stripe', 'card'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return c.json({
                success: false,
                error: { message: t('payment_method_invalid', lang) }
            }, 400);
        }

        // 8.E: المستلم — يجب أن يكون مستخدماً موجوداً (وإلا 404).
        let recipientId: number | null = null;
        if (competitor_id !== undefined && competitor_id !== null) {
            recipientId = Number.parseInt(String(competitor_id), 10);
            if (!Number.isInteger(recipientId) || (recipientId as number) <= 0) {
                return c.json({
                    success: false,
                    error: { message: t('errors.invalid_request', lang) }
                }, 400);
            }
            const recipient = await new UserModel(c.env.DB).findById(recipientId as number);
            if (!recipient) {
                return c.json({
                    success: false,
                    error: { message: t('not_found', lang) }
                }, 404);
            }
        }

        // Get user if logged in
        const user = c.get('user');

        // 8.E + 3.A: التبرع لمستخدم قام بحظرك مرفوض (403) — فحص خادمي
        // اتجاهي قبل أي أثر (لا صف ولا مال ولا Stripe) وليس في العميل فقط.
        if (recipientId !== null) {
            const blocked = await donationModel.isBlockedByRecipient(recipientId, user?.id ?? null);
            if (blocked) {
                return c.json({
                    success: false,
                    error: { message: t('donations.blocked', lang) }
                }, 403);
            }
        }

        // 8.E + تصحيح REMOTE 5: سياق البث — المنافسة يجب أن تكون live
        // والمستلم أحد متنافسَيها (creator/opponent)، والمستلم إلزامي مع
        // سياق البث (حدث SSE يحتاج متنافساً). الرفض هنا قبل أي أثر: لا صف
        // ولا مال ولا Stripe ولا SSE — برسالة i18n واحدة.
        let liveCompetitionId: number | null = null;
        if (competition_id !== undefined && competition_id !== null) {
            liveCompetitionId = Number.parseInt(String(competition_id), 10);
            if (!Number.isInteger(liveCompetitionId) || (liveCompetitionId as number) <= 0) {
                return c.json({
                    success: false,
                    error: { message: t('errors.invalid_request', lang) }
                }, 400);
            }
            const competition = await new CompetitionModel(c.env.DB).findOne('id', liveCompetitionId as number);
            if (!competition) {
                return c.json({
                    success: false,
                    error: { message: t('not_found', lang) }
                }, 404);
            }
            const contextOk =
                recipientId !== null &&
                competition.status === 'live' &&
                (recipientId === competition.creator_id || recipientId === competition.opponent_id);
            if (!contextOk) {
                return c.json({
                    success: false,
                    error: { message: t('donations.invalid_competition', lang) }
                }, 400);
            }
        }

        // Create donation record
        const donation = await donationModel.createDonation({
            user_id: user?.id,
            recipient_user_id: recipientId,
            competition_id: liveCompetitionId,
            amount,
            payment_method,
            donor_name: is_anonymous ? null : donor_name,
            donor_email,
            message,
            is_anonymous
        });

        // T4.1: Real Stripe Checkout when configured; mock URL otherwise (dev)
        let paymentUrl = `#payment-${donation.id}`;
        const stripeKey = c.env.STRIPE_SECRET_KEY;
        if ((payment_method === 'stripe' || payment_method === 'card') && stripeKey) {
            try {
                const { StripeService } = await import('../../../lib/services/StripeService');
                const origin = c.req.header('origin') || 'https://dueli.maelshpro.com';
                // 8.E: تمرير سياق المتنافس في رابط العودة لعرض رسالة الشكر
                // المناسبة — لا يؤثر على الدفع نفسه.
                const competitorQs = donation.recipient_user_id != null
                    ? `&competitor=${donation.recipient_user_id}`
                    : '';
                const session = await StripeService.createCheckoutSession(stripeKey, {
                    amount,
                    donationId: donation.id,
                    donorEmail: donor_email || null,
                    donorName: is_anonymous ? null : (donor_name || null),
                    message: message || null,
                    successUrl: `${origin}/donate?paid=1&session_id={CHECKOUT_SESSION_ID}${competitorQs}`,
                    cancelUrl: `${origin}/donate?cancelled=1`
                });
                paymentUrl = session.url;
            } catch (stripeError: any) {
                console.error('[Donations] Stripe checkout failed:', stripeError);
                return c.json({
                    success: false,
                    error: { message: t('payment_failed', lang) }
                }, 502);
            }
        }

        return c.json({
            success: true,
            data: {
                donation_id: donation.id,
                amount: donation.amount,
                currency: donation.currency,
                competitor_id: donation.recipient_user_id,
                competition_id: donation.competition_id,
                payment_url: paymentUrl,
                message: 'Donation created. Complete payment to finalize.'
            }
        });
    } catch (error) {
        console.error('Create donation error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to create donation' }
        }, 500);
    }
});

/**
 * POST /api/donations/webhook
 * T4.1 / 8.C: Stripe webhook — verifies the Stripe-Signature (HMAC-SHA256)
 * FIRST, then delegates every financial effect to StripeWebhookService which
 * writes balanced ledger entries through LedgerService only.
 *
 * Idempotency: the same `event.id` processed 10 times produces exactly ONE
 * financial effect (UNIQUE(event_id) + ledger tx_id guard). Unsupported event
 * types return 200 with NO financial effect. A missing or forged signature
 * returns 400 before any DB write.
 *
 * Configure in Stripe Dashboard with STRIPE_WEBHOOK_SECRET env var.
 */
donationsRoutes.post('/webhook', async (c) => {
    try {
        const secret = c.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
            return c.json({ success: false, error: { message: 'Webhook not configured' } }, 503);
        }

        const rawBody = await c.req.text();
        const sigHeader = c.req.header('Stripe-Signature') || '';

        // 8.C §2: signature verified BEFORE any processing or DB write.
        const { StripeService } = await import('../../../lib/services/StripeService');
        const check = await StripeService.verifyWebhookSignature(rawBody, sigHeader, secret);
        if (!check.valid) {
            console.error('[Donations] Webhook signature invalid:', check.reason);
            return c.json({ success: false, error: { message: 'Invalid signature' } }, 400);
        }

        // Only now is the payload trusted enough to parse.
        const event: StripeEventShape = JSON.parse(rawBody);

        const { StripeWebhookService } = await import('../../../lib/services/StripeWebhookService');
        const service = new StripeWebhookService(c.env.DB);
        const result = await service.processEvent(c.env.DB, event);

        if (!result.eventId) {
            return c.json({ success: false, error: { message: 'Malformed event' } }, 400);
        }

        // 8.E: نجاح تبرع أثناء البث ⇒ بث حدث التبرع على SSE الموجود
        // (قناة المنافسة) — لا نظام realtime جديد. الاسترداد (kind=refund)
        // لا يبث حدث استلام. الفشل هنا لا يُفشل الـwebhook (يُسجَّل فقط)
        // حتى لا يعيد Stripe المحاولة بلا داعٍ.
        if (result.applied && result.kind === 'capture' && result.competitionId != null && result.donationId != null) {
            try {
                const donationModel = new DonationModel(c.env.DB);
                const donation = await donationModel.findById(result.donationId);
                const pct = await new PlatformSettingsModel(c.env.DB).getPlatformSharePercentage();
                const split = splitDonationCents(result.amountCents ?? 0, pct);
                const pusher = new EventPusher(c.env.DB, c.env);
                await pusher.publishDonation(result.competitionId, {
                    donation_id: result.donationId,
                    competitor_id: donation?.recipient_user_id ?? 0,
                    amount_cents: result.amountCents ?? 0,
                    net_cents: split.netCents,
                    donor_name: donation?.is_anonymous ? null : (donation?.donor_name ?? null),
                });
            } catch (sseError) {
                console.error('[Donations] donation SSE publish failed:', sseError);
            }
        }

        // 8.C §7: every outcome returns 200 so Stripe stops retrying, EXCEPT
        // malformed events (no event.id) which are rejected above. Financial
        // effects happen only for `applied: true`.
        return c.json({ received: true, event_id: result.eventId, applied: result.applied });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return c.json({ success: false, error: { message: 'Webhook processing failed' } }, 500);
    }
});

/**
 * GET /api/donations/my
 * Get current user's donations
 */
donationsRoutes.get('/my', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({
                success: false,
                error: { message: 'Unauthorized' }
            }, 401);
        }

        const donationModel = new DonationModel(c.env.DB);
        const donations = await donationModel.getDonationsByUser(user.id);

        return c.json({
            success: true,
            data: donations
        });
    } catch (error) {
        console.error('Get my donations error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get donations' }
        }, 500);
    }
});

export default donationsRoutes;
