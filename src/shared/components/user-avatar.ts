/**
 * Shared user-avatar / profile-link helpers (B6).
 *
 * Canonical profile route in this project is `/profile/:username` (verified
 * against the page route and the existing tests), so a profile URL can only be
 * built from a **username**. An id is never substituted, because that would
 * produce a broken link.
 *
 * `nested` marks surfaces that are already an anchor (competition card, the
 * messages dropdown row). Nesting an <a> inside an <a> is invalid HTML, so in
 * that case the avatar stays an image and carries a CSP-safe delegated action
 * that navigates to the very same profile path.
 */

import type { Language } from '../../config/types';

/** Canonical profile path, or null when no valid username exists. */
export function getProfilePath(username: unknown, lang: Language): string | null {
    if (typeof username !== 'string') return null;
    const clean = username.trim();
    if (!clean) return null;
    return `/profile/${encodeURIComponent(clean)}?lang=${lang}`;
}

/** Accessible label for a real user avatar. */
export function getUserLabel(displayName: unknown, username: unknown): string {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (name) return name;
    return typeof username === 'string' ? username.trim() : '';
}

export interface UserAvatarOptions {
    username?: unknown;
    displayName?: unknown;
    avatarUrl?: unknown;
    fallbackSeed?: string;
    lang: Language;
    /** true when the surrounding markup is already an <a>. */
    nested?: boolean;
    /** false renders a bare <img> (the parent already links to this profile). */
    linkToProfile?: boolean;
    className?: string;
    imgClassName?: string;
    loading?: 'lazy' | 'eager';
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function avatarSrc(opts: UserAvatarOptions): string {
    const url = typeof opts.avatarUrl === 'string' ? opts.avatarUrl.trim() : '';
    if (url) return url;
    const seed = opts.fallbackSeed || 'default';
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Renders a user avatar. Clickable only when it represents a real Dueli user
 * with a valid username; decorative and placeholder avatars are never linked.
 */
export function getUserAvatarLink(opts: UserAvatarOptions): string {
    const label = escapeAttr(getUserLabel(opts.displayName, opts.username));
    const imgClass = opts.imgClassName || 'w-full h-full rounded-full';
    const img = `<img src="${escapeAttr(avatarSrc(opts))}" alt="${label}" class="${imgClass}" loading="${opts.loading || 'lazy'}" data-csp-on="error" data-csp-fn="__fallbackSrc" data-csp-args='["@this","https://api.dicebear.com/7.x/avataaars/svg?seed=default"]'>`;

    if (opts.linkToProfile === false) return img;

    const path = getProfilePath(opts.username, opts.lang);
    if (!path) return img;

    const cls = opts.className || '';
    if (opts.nested) {
        // Valid-HTML alternative to a nested anchor: the image carries the
        // profile target as a delegated action. The event is passed so the
        // handler can cancel the parent anchor/row navigation.
        const username = escapeAttr(String(opts.username).trim());
        return `<span role="link" tabindex="0" aria-label="${label}" class="${cls}" data-csp-on="click" data-csp-fn="__navigateProfile" data-csp-args='["${username}","@event"]' data-csp-stop="1">${img}</span>`;
    }
    return `<a href="${path}" aria-label="${label}" class="${cls}">${img}</a>`;
}

