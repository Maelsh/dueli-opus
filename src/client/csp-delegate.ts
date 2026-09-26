/**
 * @file src/client/csp-delegate.ts
 * @description CSP-safe event delegation (C5 — removes all inline handlers).
 *
 * Server/client templates emit `data-csp-on / data-csp-fn / data-csp-args`
 * instead of `onclick="..."` etc. This external module (allowed by
 * `script-src 'self'`) dispatches them to real functions — no eval, no
 * inline code. Args support JSON literals plus "@this", "@event" and
 * "@this.<path>" markers resolved at dispatch time.
 *
 * Function resolution is allowlist-only: an injected data-csp-fn for an
 * unknown name is ignored (no open gadget for stored-XSS escalation).
 */

type AnyFn = (...args: unknown[]) => unknown;

function resolvePath(root: unknown, path: string): unknown {
    let current: unknown = root;
    for (const part of path.split('.')) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function resolveArg(arg: unknown, target: EventTarget | null, event: Event): unknown {
    if (arg === '@this') return target;
    if (arg === '@event') return event;
    if (typeof arg === 'string' && arg.startsWith('@this.')) {
        return resolvePath(target, arg.slice('@this.'.length));
    }
    return arg;
}

function resolveFn(name: string): AnyFn | null {
    if (!ACTION_ALLOWLIST.has(name)) return null;
    const parts = name.split('.');
    let current: unknown = window as unknown;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'function' ? (current as AnyFn) : null;
}

/** Built-in declarative actions (no page function needed). */
const BUILTINS: Record<string, AnyFn> = {
    __fallbackSrc: (el: unknown, url: unknown) => {
        if (el instanceof HTMLImageElement && typeof url === 'string') el.src = url;
    },
    __closestRemove: (el: unknown, selector: unknown) => {
        if (el instanceof Element && typeof selector === 'string') el.closest(selector)?.remove();
    },
    __byIdRemove: (id: unknown) => {
        if (typeof id === 'string') document.getElementById(id)?.remove();
    },
    __byIdClass: (id: unknown, op: unknown, cls: unknown) => {
        if (typeof id !== 'string' || typeof cls !== 'string') return;
        const el = document.getElementById(id);
        if (!el) return;
        if (op === 'add') el.classList.add(cls);
        else if (op === 'remove') el.classList.remove(cls);
        else if (op === 'toggle') el.classList.toggle(cls);
    },
    __byIdScroll: (id: unknown, left: unknown, behavior: unknown) => {
        if (typeof id !== 'string' || typeof left !== 'number') return;
        document.getElementById(id)?.scrollBy({
            left,
            behavior: behavior === 'smooth' ? 'smooth' : 'auto',
        });
    },
    __oauthDone: (type: unknown, error: unknown) => {
        window.opener?.postMessage({ type, error }, window.location.origin);
        window.close();
    },
    __winClose: () => {
        window.close();
    },
    __ancestorDisplayNone: (el: unknown, levels: unknown) => {
        let node = el instanceof Element ? el.parentElement : null;
        let remaining = typeof levels === 'number' ? levels - 1 : 0;
        while (node && remaining > 0) {
            node = node.parentElement;
            remaining--;
        }
        if (node instanceof HTMLElement) node.style.display = 'none';
    },
    /**
     * B6: navigate to a user profile. Used where the surrounding markup is
     * already an anchor/button, so a nested <a> would be invalid HTML. The
     * canonical route is /profile/:username; anything else is ignored.
     *
     * The event is required: without preventDefault the parent anchor's own
     * navigation still fires and races this one, so the user can land on the
     * competition/conversation instead of the profile. stopPropagation keeps
     * a parent row handler from reacting as well.
     */
    __navigateProfile: (username: unknown, event?: unknown) => {
        if (typeof username !== 'string') return;
        const clean = username.trim();
        if (!clean || clean.includes('/') || clean.includes('..')) return;
        if (event && typeof (event as Event).preventDefault === 'function') {
            (event as Event).preventDefault();
        }
        // stopPropagation is intentionally NOT called here: the dispatcher
        // already honours data-csp-stop centrally, so a parent row handler
        // cannot react either.
        const lang = new URLSearchParams(self.location.search).get('lang');
        self.location.assign(`/profile/${encodeURIComponent(clean)}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`);
    },
};

/**
 * Allowlist of callable handler names (generated from the templates by
 * dev-tools/csp-codemod inventory — every data-csp-fn in render output must be
 * listed here, otherwise clicks silently no-op and tests fail).
 */
const ACTION_ALLOWLIST: ReadonlySet<string> = new Set<string>([
    // __builtins are always allowed (handled separately, not via window).
    ...Object.keys(BUILTINS),
        'InteractionsUI.showReportModal',
    'InteractionsUI.submitReport',
    'InteractionsUI.toggleLike',
    'MessagingUI.close',
    'MessagingUI.selectConversation',
    'MessagingUI.sendMessage',
    'NotificationsUI.handleNotificationClick',
    'NotificationsUI.toggleStar',
    'ScheduleUI.close',
    'ScheduleUI.toggleReminder',
    'SettingsUI.close',
    'SettingsUI.save',
    'backToList',
    'cancelRequest',
    'cancelWithdrawal',
    'clearSiteData',
    'closeAd',
    'closeReportModal',
    'closeWithdrawalModal',
    'confirmApprove',
    'confirmReject',
    'createCampaign',
    'deleteAccount',
    'deletePost',
    'embeddedDownload',
    'embeddedToggleFullscreen',
    'embeddedTogglePlayPause',
    'endCampaign',
    'endStream',
    'filterCountries',
    'goLive',
    'grantRole',
    'handleForgotPassword',
    'handleInvitation',
    'handleLogin',
    'handleRegister',
    'handleRequest',
    'handleResetPassword',
    'handleVerifyResetCode',
    'hideLoginModal',
    'loadMoreComments',
    'loadMoreCompetitions',
    'loadMoreFinancial',
    'loadWithdrawals',
    'loginWith',
    'logout',
    'markAllMessagesRead',
    'markAllNotificationsRead',
    'openApproveModal',
    'openConversation',
    'openRejectModal',
    'openSuspendPanel',
    'openWithdrawalModal',
    'pauseCampaign',
    'performSearch',
    'processDonation',
    'publishPost',
    'reportAd',
    'requestJoin',
    'restoreBroadcast',
    'resumeCampaign',
    'revokeRole',
    'saveSettings',
    'selectAmount',
    'selectCountry',
    'sendComment',
    'sendMessage',
    'setMainTab',
    'setProfileTab',
    'setReplyTo',
    'setSubTab',
    'setTab',
    'loadCompetitions',
    'shareScreen',
    'showCreateCampaignForm',
    'showForgotPassword',
    'showGrantRoleForm',
    'showLogin',
    'showLoginModal',
    'showReportModal',
    'submitCampaign',
    'submitRating',
    'submitReport',
    'submitWithdrawal',
    'suspendBroadcast',
    'swapVideos',
    'switchAuthTab',
    'switchCamera',
    'toggleAudio',
    'toggleComments',
    'toggleCountryMenu',
    'toggleDarkMode',
    'toggleFollow',
    'toggleFullscreen',
    'toggleLike',
    'toggleLocalVideo',
    'toggleMessages',
    'toggleNotifications',
    'toggleReminder',
    'toggleUserMenu',
    'toggleVideo',
    'updateSubcategories',
    'viewComplaint',
    'window._invitePanelClose',
    'window._invitePanelHover',
    'window._invitePanelHoverEnd',
    'window._invitePanelRefresh',
    'window._invitePanelSearch',
    'window._invitePanelSendInvite',
    'window._recCarouselRefresh',
    'window._recCarouselScroll',
    'window.checkAndLoad',
    'window.connect',
    'window.disconnect',
    'window.joinRoom',
    'window.reconnect',
    'window.stopStream',
    'window.switchCamera',
    'window.toggleCamera',
    'window.toggleFullscreen',
    'window.toggleInvitePanel',
    'window.toggleLocalVideo',
    'window.toggleMic',
    'window.togglePlayPause',
    'window.toggleScreen',
    'window.toggleSpeaker',
    'window.toggleVideoFullscreen',
    // __ALLOWLIST_END__
]);

/**
 * Walks up from the event target to the nearest delegated action.
 * `type` filters on the declared event type; pass null to accept any.
 */
function findAction(start: Element, type: string | null): HTMLElement | null {
    let node: Node | null = start;
    while (node) {
        const el = node as HTMLElement;
        if (typeof el.getAttribute === 'function' && el instanceof HTMLElement) {
            const declared = el.getAttribute('data-csp-on');
            const fn = el.getAttribute('data-csp-fn');
            if (fn && declared && (type === null || declared === type)) return el;
        }
        node = node.parentElement ?? node.parentNode;
    }
    return null;
}

function dispatch(event: Event): void {
    const target = event.target as Element | null;
    if (!target) return;
    // Find the nearest ancestor action. Two passes:
    //  1. an action bound to THIS event type - this must win, otherwise a click
    //     landing on an element carrying a different handler (e.g. an
    //     <img data-csp-on="error" data-csp-fn="__fallbackSrc">) selects that
    //     unrelated handler and the enclosing action never runs, so the click
    //     falls through to the parent link;
    //  2. any action, which is what the keydown path needs (there the element
    //     is deliberately bound to "click").
    const el = findAction(target as Element, event.type) ?? findAction(target as Element, null);
    if (!el || !(el instanceof HTMLElement)) return;
    const want = el.getAttribute('data-csp-on');
    // B6: a delegated target that is not natively activatable (e.g. the
    // span[role=link] avatar used where an <a> would nest invalidly) must still
    // respond to Enter/Space, or it is keyboard-dead. Native elements
    // (button, a[href], input, select, textarea) already emit click, so they
    // are excluded here to avoid a double activation.
    if (want !== event.type) {
        if (event.type === 'keydown' && want === 'click' && !isNativelyActivatable(el)) {
            const key = (event as KeyboardEvent).key;
            if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                event.preventDefault();
                // Same arguments the click would have received, so a handler
                // that navigates can still cancel the default action.
                runHandler(el, event, [...parseArgs(el), '@event']);
            }
        }
        return;
    }
    runHandler(el, event, parseArgs(el));
}

function parseArgs(el: HTMLElement): unknown[] {
    const rawArgs = el.getAttribute('data-csp-args');
    if (!rawArgs) return [];
    try {
        const parsed: unknown = JSON.parse(rawArgs);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const NATIVELY_ACTIVATABLE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION']);

function isNativelyActivatable(el: HTMLElement): boolean {
    if (el.tagName === 'A' && el.getAttribute('href')) return true;
    return NATIVELY_ACTIVATABLE.has(el.tagName);
}

function runHandler(el: HTMLElement, event: Event, args: unknown[]): void {
    // Honoured centrally so every delegated action can opt out of a parent
    // handler, on both the click and the keyboard path.
    if (el.hasAttribute('data-csp-stop')) event.stopPropagation();
    const fnName = el.getAttribute('data-csp-fn') || '';
    const fn: AnyFn | null = fnName.startsWith('__') && !fnName.includes('.') && fnName in BUILTINS
        ? BUILTINS[fnName] as AnyFn
        : resolveFn(fnName);
    if (!fn) return;
    try {
        fn(...args.map((a) => resolveArg(a, el, event)));
    } catch (err) {
        console.error('[csp-delegate] handler failed:', fnName, err);
    }
}

const DELEGATED_EVENTS = [
    'click',
    'submit',
    'change',
    'input',
    'keyup',
    'keydown',
    'mouseover',
    'mouseout',
    'mouseenter',
    'mouseleave',
    'focus',
    'blur',
] as const;

/**
 * CSP-safe dynamic styles (C5): templates emit `data-csp-style="prop: value;…"`
 * instead of `style="…"`. Applying them from this external script is NOT
 * blocked by style-src (CSSOM writes are not style attributes). Covers both
 * server-rendered and dynamically inserted nodes via MutationObserver.
 */
function applyCspStyles(root: Document | Element): void {
    const nodes = root.querySelectorAll('[data-csp-style]:not([data-csp-style-done])');
    for (const node of Array.from(nodes)) {
        if (!(node instanceof HTMLElement)) continue;
        const css = node.getAttribute('data-csp-style') || '';
        try {
            node.style.cssText += (node.style.cssText && !node.style.cssText.endsWith(';') ? ';' : '') + css;
        } catch {
            continue;
        }
        node.setAttribute('data-csp-style-done', '1');
    }
}

if (typeof document !== 'undefined') {
    for (const type of DELEGATED_EVENTS) {
        document.addEventListener(type, dispatch, true);
    }
    // Resource errors (e.g. img fallback) do not bubble — capture is required.
    document.addEventListener('error', dispatch, true);
    applyCspStyles(document);
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (node instanceof HTMLElement) {
                    if (node.hasAttribute('data-csp-style')) applyCspStyles(node.parentElement || document);
                    else applyCspStyles(node);
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
}
