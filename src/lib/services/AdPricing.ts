/**
 * UNIT36.1 — the ONE effective impression-price calculation.
 *
 * Effective price (integer cents):
 *
 *   country base × H7 × targeting × media × duration
 *
 * Rules (documented so the money path cannot drift):
 * - `country_base_cents` is an admin-supplied map of ISO-3166 alpha-2 country
 *   code → integer cents. The competition country selects the base; an absent
 *   country entry (or no config at all) keeps the campaign's own
 *   `cost_per_impression_cents` unchanged.
 * - `multipliers.h7` applies whenever it is configured. H7 is a policy name,
 *   not a number: this service never invents a default.
 * - `multipliers.targeting` applies only when the campaign actually has a
 *   targeting dimension (language, country, or category). A non-targeted
 *   campaign is not charged for targeting.
 * - `multipliers.media.image|gif|video` applies by the ad's media kind.
 *   Legacy rows default to image.
 * - `multipliers.duration.<seconds>` applies to a video creative whose exact
 *   `duration_sec` is a configured key. Missing duration/config = ×1.
 * - All absent multipliers are ×1. No numeric default is stored or seeded.
 * - Rounding is `Math.round` (half away from zero for the positive values
 *   used here), then the result is clamped to at least 1 cent. This is the
 *   single rounding point in the pricing path.
 *
 * The admin validator only accepts finite positive numbers with safe upper
 * bounds; it rejects unknown keys instead of silently ignoring typos. That
 * keeps an invalid configuration from changing money behavior. A corrupt or
 * invalid stored config is ignored (parse returns null), so serving falls
 * back to the campaign cost exactly as before this unit.
 */

export const AD_PRICING_SETTING_KEY = 'ad_pricing_config';

export const AD_MEDIA_KINDS = ['image', 'gif', 'video'] as const;
export type AdMediaKind = typeof AD_MEDIA_KINDS[number];

/** Validation bounds — not prices, only denial-of-service/overflow guards. */
export const MAX_COUNTRY_BASE_CENTS = 100_000_000;
export const MAX_MULTIPLIER = 1_000;
export const MAX_DURATION_SECONDS = 86_400;
export const MAX_COUNTRY_ENTRIES = 250;
export const MAX_DURATION_ENTRIES = 100;

export interface AdPricingConfig {
    country_base_cents?: Record<string, number>;
    multipliers?: {
        h7?: number;
        targeting?: number;
        media?: Partial<Record<AdMediaKind, number>>;
        duration?: Record<string, number>;
    };
}

export interface AdPricingContext {
    /** Competition country; case-insensitive ISO alpha-2. */
    country?: string | null;
    mediaKind?: string | null;
    durationSec?: number | null;
    /** True when the campaign carries language/country/category targeting. */
    hasTargeting?: boolean;
}

export type AdPricingValidation =
    | { ok: true; config: AdPricingConfig }
    | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validMultiplier(value: unknown): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && value <= MAX_MULTIPLIER;
}

function normalizeCountryCode(value: string): string | null {
    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

function normalizeDurationKey(value: string): string | null {
    if (!/^\d+$/.test(value)) return null;
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_DURATION_SECONDS) return null;
    return String(seconds);
}

/**
 * Strictly validate and normalize an admin pricing payload.
 * Returns a new object; the caller's object is never mutated.
 */
export function validateAdPricingConfig(raw: unknown): AdPricingValidation {
    if (!isPlainObject(raw)) {
        return { ok: false, error: 'pricing config must be an object' };
    }
    for (const key of Object.keys(raw)) {
        if (key !== 'country_base_cents' && key !== 'multipliers') {
            return { ok: false, error: `unknown pricing key: ${key}` };
        }
    }

    const config: AdPricingConfig = {};

    if (raw.country_base_cents !== undefined) {
        if (!isPlainObject(raw.country_base_cents)) {
            return { ok: false, error: 'country_base_cents must be an object' };
        }
        const entries = Object.entries(raw.country_base_cents);
        if (entries.length > MAX_COUNTRY_ENTRIES) {
            return { ok: false, error: 'too many country_base_cents entries' };
        }
        const countries: Record<string, number> = {};
        for (const [rawCode, value] of entries) {
            const code = normalizeCountryCode(rawCode);
            if (!code) {
                return { ok: false, error: `invalid country code: ${rawCode}` };
            }
            if (Object.prototype.hasOwnProperty.call(countries, code)) {
                return { ok: false, error: `duplicate country code: ${code}` };
            }
            if (
                typeof value !== 'number'
                || !Number.isInteger(value)
                || value < 1
                || value > MAX_COUNTRY_BASE_CENTS
            ) {
                return { ok: false, error: `invalid country base cents: ${code}` };
            }
            countries[code] = value;
        }
        if (Object.keys(countries).length > 0) {
            config.country_base_cents = countries;
        }
    }

    if (raw.multipliers !== undefined) {
        if (!isPlainObject(raw.multipliers)) {
            return { ok: false, error: 'multipliers must be an object' };
        }
        const multipliers = raw.multipliers;
        for (const key of Object.keys(multipliers)) {
            if (!['h7', 'targeting', 'media', 'duration'].includes(key)) {
                return { ok: false, error: `unknown multiplier: ${key}` };
            }
        }

        const normalized: NonNullable<AdPricingConfig['multipliers']> = {};
        if (multipliers.h7 !== undefined) {
            if (!validMultiplier(multipliers.h7)) {
                return { ok: false, error: 'invalid h7 multiplier' };
            }
            normalized.h7 = multipliers.h7;
        }
        if (multipliers.targeting !== undefined) {
            if (!validMultiplier(multipliers.targeting)) {
                return { ok: false, error: 'invalid targeting multiplier' };
            }
            normalized.targeting = multipliers.targeting;
        }

        if (multipliers.media !== undefined) {
            if (!isPlainObject(multipliers.media)) {
                return { ok: false, error: 'media multipliers must be an object' };
            }
            const media: Partial<Record<AdMediaKind, number>> = {};
            for (const [kind, value] of Object.entries(multipliers.media)) {
                if (!(AD_MEDIA_KINDS as readonly string[]).includes(kind)) {
                    return { ok: false, error: `unknown media kind: ${kind}` };
                }
                if (!validMultiplier(value)) {
                    return { ok: false, error: `invalid ${kind} multiplier` };
                }
                media[kind as AdMediaKind] = value;
            }
            if (Object.keys(media).length > 0) normalized.media = media;
        }

        if (multipliers.duration !== undefined) {
            if (!isPlainObject(multipliers.duration)) {
                return { ok: false, error: 'duration multipliers must be an object' };
            }
            const entries = Object.entries(multipliers.duration);
            if (entries.length > MAX_DURATION_ENTRIES) {
                return { ok: false, error: 'too many duration multipliers' };
            }
            const duration: Record<string, number> = {};
            for (const [rawSeconds, value] of entries) {
                const seconds = normalizeDurationKey(rawSeconds);
                if (!seconds) {
                    return { ok: false, error: `invalid duration key: ${rawSeconds}` };
                }
                if (Object.prototype.hasOwnProperty.call(duration, seconds)) {
                    return { ok: false, error: `duplicate duration key: ${seconds}` };
                }
                if (!validMultiplier(value)) {
                    return { ok: false, error: `invalid duration multiplier: ${seconds}` };
                }
                duration[seconds] = value;
            }
            if (Object.keys(duration).length > 0) normalized.duration = duration;
        }

        if (Object.keys(normalized).length > 0) {
            config.multipliers = normalized;
        }
    }

    return { ok: true, config };
}

/**
 * Parse a stored setting. Invalid JSON or an invalid shape is ignored
 * (returns null) so a bad admin write can never alter serving charges.
 */
export function parseAdPricingConfig(raw: string | null | undefined): AdPricingConfig | null {
    if (!raw) return null;
    try {
        const result = validateAdPricingConfig(JSON.parse(raw));
        return result.ok ? result.config : null;
    } catch {
        return null;
    }
}

function campaignCents(value: number): number {
    const cents = Math.round(Number(value));
    return Number.isFinite(cents) && cents >= 1 ? cents : 1;
}

function normalizedMediaKind(value: string | null | undefined): AdMediaKind {
    return value === 'gif' || value === 'video' ? value : 'image';
}

/**
 * The single effective-price function used by the charge, ledger and payout
 * paths. Absent configuration returns the campaign cost unchanged.
 */
export function effectiveImpressionCents(
    campaignCentsValue: number,
    config: AdPricingConfig | null | undefined,
    ctx: AdPricingContext = {},
): number {
    const current = campaignCents(campaignCentsValue);
    if (!config) return current;

    const country = (ctx.country || '').trim().toUpperCase();
    const configuredBase = country ? config.country_base_cents?.[country] : undefined;
    const base = typeof configuredBase === 'number' && configuredBase >= 1
        ? configuredBase
        : current;

    let product = base;
    const multipliers = config.multipliers;
    if (!multipliers) return Math.max(1, Math.round(product));

    if (multipliers.h7 !== undefined) {
        product *= multipliers.h7;
    }
    if (ctx.hasTargeting === true && multipliers.targeting !== undefined) {
        product *= multipliers.targeting;
    }
    const mediaKind = normalizedMediaKind(ctx.mediaKind);
    const mediaMultiplier = multipliers.media?.[mediaKind];
    if (mediaMultiplier !== undefined) {
        product *= mediaMultiplier;
    }
    if (mediaKind === 'video' && ctx.durationSec !== null && ctx.durationSec !== undefined) {
        const durationMultiplier = multipliers.duration?.[String(ctx.durationSec)];
        if (durationMultiplier !== undefined) {
            product *= durationMultiplier;
        }
    }

    return Math.max(1, Math.round(product));
}
