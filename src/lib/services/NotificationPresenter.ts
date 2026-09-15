/**
 * @file src/lib/services/NotificationPresenter.ts
 * @description B9 — renders a stored notification (`type` + payload) into display
 * text **at render time** in the recipient's language.
 *
 * Contract enforced here:
 *  - the database stores `type` + untranslated payload: `title` holds an i18n
 *    KEY and `message` holds a JSON payload (or a legacy plain-text snapshot),
 *    never a pre-translated sentence;
 *  - `title`/`message` are generated per request language (`?lang=`), so the
 *    same row reads Arabic for one recipient and English for another;
 *  - legacy rows and unknown types never throw and never break the inbox —
 *    they degrade to the stored label, or to `notification.generic`;
 *  - a deep link is produced only when the target is routable (no dead links).
 */

import { t } from '../../i18n';
import type { Language, Notification, NotificationType } from '../../config/types';

/** Untranslated payload stored with a notification row (JSON in `message`). */
export interface NotificationPayload {
    actor?: string;
    preview?: string;
    content?: string;
    username?: string;
    [key: string]: unknown;
}

/** How a notification type is presented — i18n keys only, never translated text. */
export interface NotificationTypePresentation {
    /** i18n key of the notification label. */
    titleKey: string;
    /** i18n key of the body template (`{actor}` / `{preview}`) — optional. */
    bodyKey?: string;
}

/**
 * Type → i18n keys. Every value of `NotificationType` must appear here so that
 * no notification type can fall back to `notification.generic` by accident.
 */
export const NOTIFICATION_TYPE_PRESENTATION: Record<NotificationType, NotificationTypePresentation> = {
    message: { titleKey: 'notification.new_message', bodyKey: 'notification.new_message_body' },
    post_like: { titleKey: 'notification.new_post_like', bodyKey: 'notification.new_post_like_body' },
    post_comment: { titleKey: 'notification.new_post_comment', bodyKey: 'notification.new_post_comment_body' },
    comment: { titleKey: 'notification.new_comment', bodyKey: 'notification.new_comment_body' },
    request: { titleKey: 'notification.new_join_request', bodyKey: 'notification.new_join_request_body' },
    invitation: { titleKey: 'notification.competition_invite', bodyKey: 'notification.competition_invite_body' },
    follow: { titleKey: 'new_follower' },
    rating: { titleKey: 'notification.new_rating', bodyKey: 'notification.new_rating_body' },
    system: { titleKey: 'notification.system_notice' },
};

/** Label used when nothing else can be resolved (unknown / empty legacy rows). */
export const NOTIFICATION_GENERIC_KEY = 'notification.generic';

/** Body key for a specific label key (overrides the type default). */
export const NOTIFICATION_BODY_KEYS: Record<string, string> = {
    'notification.new_message': 'notification.new_message_body',
    'notification.new_comment': 'notification.new_comment_body',
    'notification.new_post_like': 'notification.new_post_like_body',
    'notification.new_post_comment': 'notification.new_post_comment_body',
    'notification.new_join_request': 'notification.new_join_request_body',
    'notification.request_accepted': 'notification.request_accepted_message',
    'notification.competition_invite': 'notification.competition_invite_body',
    'notification.invitation_accepted': 'notification.competition_invite_body',
    'notification.new_rating': 'notification.new_rating_body',
};

/** Row shape served by `GET /api/notifications` (Presentation Model). */
export interface PresentedNotification extends Notification {
    /** Localized label, generated from the type's i18n key. */
    title: string;
    /** Localized / payload-derived body. */
    message: string;
    /** i18n key the label was rendered from (null for legacy labels). */
    i18n_key: string | null;
    /** Deep link for the notification target, or null when there is none. */
    link: string | null;
    /** Parsed payload when the row stores one. */
    payload: NotificationPayload | null;
}

/**
 * Notification Presenter
 * Turns `type + payload` rows into localized display text (no DB access).
 */
export class NotificationPresenter {

    /**
     * Effective type of a row.
     * Legacy rows written by the old copy/paste bug stored *messages* as
     * `type = 'comment'` with `reference_type = 'conversation'`; they are read
     * back as messages so old rows also say "new message" instead of "comment".
     */
    static effectiveType(type: string, referenceType?: string | null): NotificationType {
        if (type === 'comment' && referenceType === 'conversation') return 'message';
        return type as NotificationType;
    }

    /** Label i18n key for a type (used by NotificationModel when creating rows). */
    static titleKeyFor(type: NotificationType, referenceType?: string | null): string {
        const effective = NotificationPresenter.effectiveType(type, referenceType);
        return NOTIFICATION_TYPE_PRESENTATION[effective]?.titleKey || NOTIFICATION_GENERIC_KEY;
    }

    /** True when a stored label is an i18n key (resolves in the current packs). */
    static isI18nKey(candidate: string | null | undefined): boolean {
        if (!candidate || !candidate.includes('.')) return false;
        return t(candidate, 'en') !== candidate;
    }

    /** Parse the stored payload — never throws (legacy rows hold plain text). */
    static parsePayload(raw: unknown): NotificationPayload | null {
        if (typeof raw !== 'string' || raw.trim().length === 0) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as NotificationPayload;
            }
            return null;
        } catch {
            return null;
        }
    }

    /** Render one row for the requested language. */
    static present(row: Notification, lang: Language): PresentedNotification {
        const payload = NotificationPresenter.parsePayload(row.message);
        const storedTitle = typeof row.title === 'string' ? row.title.trim() : '';
        const effective = NotificationPresenter.effectiveType(row.type, row.reference_type ?? null);
        const presentation = NOTIFICATION_TYPE_PRESENTATION[effective];

        // 1. a stored i18n key is exact and wins (new rows), 2. otherwise the
        // type decides the label — the type is the source of truth (B9).
        const key = NotificationPresenter.isI18nKey(storedTitle)
            ? storedTitle
            : (presentation?.titleKey ?? null);

        const localized = key ? t(key, lang) : '';
        const title = localized && localized !== key
            ? localized
            : (storedTitle || t(NOTIFICATION_GENERIC_KEY, lang));

        const bodyKey = (key ? NOTIFICATION_BODY_KEYS[key] : undefined) ?? presentation?.bodyKey;
        const message = payload
            ? (bodyKey
                ? NotificationPresenter.applyTemplate(t(bodyKey, lang), payload)
                : NotificationPresenter.payloadText(payload))
            : (typeof row.message === 'string' ? row.message : '');

        return {
            ...row,
            title,
            message,
            i18n_key: key,
            link: NotificationPresenter.linkFor(row, lang),
            payload,
        };
    }



    /** Deep link for the notification target — null when there is no route. */
    static linkFor(row: Notification, lang: Language): string | null {
        const id = Number(row.reference_id);
        if (!Number.isFinite(id) || id <= 0) return null;

        const suffix = `lang=${encodeURIComponent(lang)}`;
        switch (row.reference_type) {
            case 'competition':
                return `/competition/${id}?${suffix}`;
            case 'conversation':
                return `/messages?conversation=${id}&${suffix}`;
            case 'post': {
                // Posts live on their author's profile (`/profile/:username`).
                const payload = NotificationPresenter.parsePayload(row.message);
                const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
                return username ? `/profile/${encodeURIComponent(username)}?tab=posts&${suffix}` : null;
            }
            default:
                // e.g. `user` refs: `/profile/:username` needs a username, and
                // inventing one here would create a dead link.
                return null;
        }
    }

    /** `actor: preview` (or whichever part the payload carries). */
    private static payloadText(payload: NotificationPayload): string {
        const actor = typeof payload.actor === 'string' ? payload.actor.trim() : '';
        const preview = typeof payload.preview === 'string'
            ? payload.preview
            : (typeof payload.content === 'string' ? payload.content : '');
        if (actor && preview) return `${actor}: ${preview}`;
        return preview || actor;
    }

    /** Fill `{actor}` / `{preview}` / `{content}` in a translated body template. */
    private static applyTemplate(template: string, payload: NotificationPayload): string {
        const raw = (value: unknown): string => (typeof value === 'string' ? value : '');
        const substituted = template
            .replace(/\{actor\}/g, raw(payload.actor))
            .replace(/\{preview\}/g, raw(payload.preview) || raw(payload.content))
            .replace(/\{content\}/g, raw(payload.content) || raw(payload.preview));

        const cleaned = substituted
            .replace(/\s*\{[a-z_]+\}\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[:،,\-–—]\s*/, '')
            .replace(/\s*[:،,\-–—]$/, '')
            .trim();

        // Nothing was substituted (payload carries no actor/preview) or the
        // body key has no translation → fall back to the raw payload text.
        if (cleaned === template) return NotificationPresenter.payloadText(payload);
        return cleaned || NotificationPresenter.payloadText(payload);
    }
}

export default NotificationPresenter;
