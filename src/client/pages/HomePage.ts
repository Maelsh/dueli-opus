
import { State } from '../core/State';
import { getCompetitionCard, type CompetitionCardProps } from '../../shared/components/competition-card';
import {
    getHomeRailSection,
    getHomeRailErrorSection,
    getRailSentinelHTML,
    homeRailScrollerId,
    homeRailSentinelId,
    homeRailSectionId,
    railViewAllHref,
} from '../../shared/components/home-rail';
import { SUBCATEGORY_COLORS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_SUBCATEGORIES, SUBCATEGORY_ICONS } from '../../shared/constants';
import { translations, getUILanguage } from '../../i18n';

type RailKind = 'suggested' | 'category';
type RailStatus = 'live' | 'recorded' | 'upcoming';

interface RailDef {
    key: string;
    kind: RailKind;
    title: string;
    icon: string;
    color: string;
    category: string;
    subcategory: string;
    status: RailStatus;
}

interface RailCard {
    id?: string | number;
    [key: string]: unknown;
}

interface RailOpen {
    items: RailCard[];
    sessionId: string;
    cursor: string | null;
    done: boolean;
}

interface RailState extends RailDef {
    sessionId: string | null;
    cursor: string | null;
    done: boolean;
    loading: boolean;
    seen: Set<string | number>;
    recreated: boolean;
    generation: number;
    observer: IntersectionObserver | null;
}

export class HomePage {
    static currentMainTab: 'live' | 'upcoming' | 'recorded' = 'live';
    static currentSubTab: string = 'all';
    static searchTimeout: ReturnType<typeof setTimeout>;
    /**
     * R3-RAILS-1B: every Home rail owns an independent frozen session
     * (Suggested Guest/User, Dialogue/Science/Talents and each subcategory,
     * crossed with Live/Recorded/Upcoming). The end of a rail comes ONLY
     * from the server hasMore flag — never from batch length, never from a
     * silent 15-row list, and never from cross-rail dedup (a competition may
     * deservedly appear in Suggested and in its own section).
     */
    static rails: Map<string, RailState> = new Map();
    static railGeneration: number = 0;
    static authHooked: boolean = false;
    static tokenSeq: number = 0;
    static readonly RAIL_BATCH = 15;

    static init() {
        // A login changes the rail identity (guest -> user): drop the stale
        // snapshot and start a new context. Logout reloads the page, which
        // re-runs init on a fresh context.
        if (!this.authHooked && typeof window !== 'undefined') {
            this.authHooked = true;
            window.addEventListener('dueli:auth-success', () => {
                void this.loadCompetitions();
            });
        }

        // Initial load
        this.loadCompetitions();
        this.bindSearchEvents();
    }

    static tabStatus(): RailStatus {
        if (this.currentMainTab === 'recorded') return 'recorded';
        if (this.currentMainTab === 'upcoming') return 'upcoming';
        return 'live';
    }

    static async loadCompetitions() {
        const container = document.getElementById('mainContent');
        if (!container) return;

        const lang = State.lang;
        const tr = translations[getUILanguage(lang)];

        // A new context invalidates every in-flight rail response: each
        // continuation carries its generation and is discarded when stale.
        this.railGeneration += 1;
        const generation = this.railGeneration;
        this.teardownRails();

        container.innerHTML = '<div class="flex flex-col items-center justify-center py-16"><i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i></div>';

        // One first-party guest identity for every rail opened below: the
        // creates run in parallel, so a lazily-issued per-call token would
        // bind each rail to a DIFFERENT identity (last-write-wins in
        // storage) and every continuation would 404. Pre-issue synchronously
        // instead — the server adopts a well-formed presented token as-is.
        // No Math.random here (SEC-06): WebCrypto, else a time+counter stamp.
        this.ensureGuestToken();

        try {
            const status = this.tabStatus();
            const defs = this.buildRailDefs(status, lang);
            this.lastDefs = defs;
            const opened = await Promise.all(defs.map((def) => this.openRail(def)));
            // A tab/category/language/login switch while opening discards the
            // whole paint — the newer generation owns the container now.
            if (generation !== this.railGeneration) return;

            let html = '';
            const armed: Array<{ def: RailDef; open: RailOpen }> = [];
            defs.forEach((def, index) => {
                const result = opened[index];
                if (result === null) {
                    html += getHomeRailErrorSection(def.key, def.title, def.icon, lang, def.color);
                    return;
                }
                if (result.items.length === 0) return;
                const cardsHtml = result.items
                    .map((item) => getCompetitionCard(item as unknown as CompetitionCardProps, lang))
                    .join('');
                html += getHomeRailSection({
                    railKey: def.key,
                    title: def.title,
                    icon: def.icon,
                    lang,
                    color: def.color,
                    cardsHtml,
                    sentinelMode: result.done ? 'end' : 'idle',
                    viewAllHref: railViewAllHref({
                        kind: def.kind,
                        category: def.category,
                        subcategory: def.subcategory,
                        status: def.status,
                        lang,
                    }),
                });
                if (!result.done) armed.push({ def, open: result });
            });

            if (!html) {
                container.innerHTML = this.renderEmptyState(tr);
                return;
            }

            container.innerHTML = html;

            // Setup hover scroll for all sections with scrollable containers
            this.setupAllHoverScroll();

            for (const { def, open } of armed) {
                if (generation !== this.railGeneration) return;
                const state: RailState = {
                    ...def,
                    sessionId: open.sessionId,
                    cursor: open.cursor,
                    done: open.done,
                    loading: false,
                    seen: new Set<string | number>(),
                    recreated: false,
                    generation,
                    observer: null,
                };
                for (const item of open.items) state.seen.add(this.itemKey(item));
                this.rails.set(def.key, state);
                this.wireRetryButton(def.key);
                this.armRailObserver(def.key);
            }
            // Error sections painted above need their retry wired too.
            for (const def of defs) {
                if (!this.rails.has(def.key)) this.wireRetryButton(def.key);
            }
        } catch (err) {
            console.error(err);
            if (generation !== this.railGeneration) return;
            container.innerHTML = `<div class="text-center py-16 text-red-500">${tr.error_loading || 'Error loading content'}</div>`;
        }
    }

    /**
     * R3-RAILS-1B: the rail composition of the current tabs. 'all' shows
     * Suggested + the three main sections; a category tab shows Suggested
     * for that scope? No — it shows each subcategory rail (same as before,
     * now session-backed), each carrying the live tab status.
     */
    static buildRailDefs(status: RailStatus, lang: string): RailDef[] {
        const tr = translations[getUILanguage(lang)];
        const defs: RailDef[] = [];
        const suggestedTitle = tr.sections?.suggested || 'Recommended';
        if (this.currentSubTab !== 'all') {
            const subcategories = CATEGORY_SUBCATEGORIES[this.currentSubTab] || [];
            for (const subcat of subcategories) {
                const lookupSlug = subcat.replace(/-/g, '_');
                const subName =
                    (tr.categories as unknown as Record<string, string>)[lookupSlug] ||
                    (tr.categories as unknown as Record<string, string>)[subcat] ||
                    subcat;
                defs.push({
                    key: `sub-${subcat}-${status}`,
                    kind: 'category',
                    title: subName,
                    icon: SUBCATEGORY_ICONS[subcat] || 'fas fa-tag',
                    color: SUBCATEGORY_COLORS[subcat] || '#8B5CF6',
                    category: this.currentSubTab,
                    subcategory: subcat,
                    status,
                });
            }
            return defs;
        }
        defs.push({
            key: `suggested-${status}`,
            kind: 'suggested',
            title: suggestedTitle,
            icon: 'fas fa-fire',
            color: '#8B5CF6',
            category: '',
            subcategory: '',
            status,
        });
        const mains: Array<{ slug: string }> = [{ slug: 'dialogue' }, { slug: 'science' }, { slug: 'talents' }];
        for (const main of mains) {
            const title =
                (tr.categories as unknown as Record<string, string>)[main.slug] || main.slug;
            defs.push({
                key: `cat-${main.slug}-${status}`,
                kind: 'category',
                title,
                icon: CATEGORY_ICONS[main.slug] || 'fas fa-tag',
                color: CATEGORY_COLORS[main.slug] || '#8B5CF6',
                category: main.slug,
                subcategory: '',
                status,
            });
        }
        return defs;
    }

    /**
     * Freeze one rail session and read its first page. Any failure yields
     * null — the rail paints an explicit translated retry, never a silent
     * partial list presented as complete.
     */
    static async openRail(def: RailDef): Promise<RailOpen | null> {
        try {
            const body: Record<string, string> = { kind: def.kind, status: def.status };
            if (def.category !== '') body['category'] = def.category;
            if (def.subcategory !== '') body['subcategory'] = def.subcategory;
            const createRes = await fetch(`/api/home-rails/sessions?lang=${State.lang}`, {
                method: 'POST',
                headers: this.guestHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body),
            });
            if (!createRes.ok) return null;
            const created = (await createRes.json()) as {
                success?: unknown;
                data?: { session?: { id?: unknown }; guest_token?: unknown };
            };
            const sid = created?.success && created.data?.session?.id ? String(created.data.session.id) : '';
            if (!sid) return null;
            this.storeGuestToken(created.data?.guest_token);
            const page = await this.readRailPage(sid, def, null);
            if (page === null || 'lapsed' in page) return null;
            return { items: page.items, sessionId: sid, cursor: page.nextCursor, done: !page.hasMore };
        } catch (err) {
            console.error('[HomePage] rail open failed:', def.key, err);
            return null;
        }
    }

    static itemKey(item: RailCard): string | number {
        return item && item.id !== undefined && item.id !== null ? item.id : `unkeyed:${JSON.stringify(item).length}`;
    }

    static async readRailPage(
        sid: string,
        def: RailDef,
        cursor: string | null
    ): Promise<{ items: RailCard[]; nextCursor: string | null; hasMore: boolean } | { lapsed: true } | null> {
        const q = new URLSearchParams();
        q.set('kind', def.kind);
        if (def.category !== '') q.set('category', def.category);
        if (def.subcategory !== '') q.set('subcategory', def.subcategory);
        q.set('status', def.status);
        q.set('limit', String(this.RAIL_BATCH));
        q.set('lang', State.lang);
        if (cursor) q.set('cursor', cursor);
        let res: Response;
        try {
            res = await fetch(`/api/home-rails/sessions/${encodeURIComponent(sid)}/page?${q.toString()}`, {
                headers: this.guestHeaders({}),
            });
        } catch {
            return null;
        }
        // Lapsed sessions (expired/missing/context-drifted) restart the rail
        // from a fresh freeze — once — never by mixing two snapshots.
        if (res.status === 410 || res.status === 404 || res.status === 409) {
            return { lapsed: true };
        }
        if (!res.ok) return null;
        const data = (await res.json()) as {
            success?: unknown;
            data?: { items?: unknown; nextCursor?: unknown; hasMore?: unknown } | null;
        };
        const payload = data && data.success && data.data ? data.data : null;
        if (!payload || !Array.isArray(payload.items)) return null;
        return {
            items: payload.items as RailCard[],
            nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
            hasMore: payload.hasMore === true,
        };
    }

    static ensureGuestToken(): void {
        if (State.sessionId) return;
        try {
            if (typeof localStorage === 'undefined') return;
            if (localStorage.getItem('dueli_guest_token')) return;
            let fresh: string | null = null;
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                fresh = crypto.randomUUID();
            } else {
                this.tokenSeq += 1;
                fresh = `guest-${Date.now().toString(36)}-${this.tokenSeq.toString(36)}`;
            }
            localStorage.setItem('dueli_guest_token', fresh);
        } catch {
            // Private mode: the server issues a token per call instead
            // (parallel rails then heal via the single-restart path).
        }
    }

    static guestHeaders(extra: Record<string, string>): Record<string, string> {
        const headers: Record<string, string> = { ...(extra || {}) };
        if (State.sessionId) headers['Authorization'] = 'Bearer ' + State.sessionId;
        try {
            const guest = typeof localStorage !== 'undefined' ? localStorage.getItem('dueli_guest_token') : null;
            if (guest) headers['X-Guest-Token'] = guest;
        } catch {
            // Private mode: the server issues a token per call instead.
        }
        return headers;
    }

    static storeGuestToken(token: unknown): void {
        if (typeof token !== 'string' || !token) return;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('dueli_guest_token', token);
        } catch {
            // Best-effort first-party persistence only.
        }
    }

    static teardownRails(): void {
        for (const state of this.rails.values()) {
            if (state.observer) {
                try {
                    state.observer.disconnect();
                } catch {
                    // Harness/shim without full observer support.
                }
            }
        }
        this.rails.clear();
    }

    /**
     * R3-RAILS-1B: continue one frozen rail as its own scroller nears its
     * end. Each batch appends at the frozen cursor; a retry re-reads the SAME
     * cursor (no double append — items are per-rail deduped); the end comes
     * ONLY from the server hasMore flag. Partial/empty batches with
     * hasMore=true keep going; a lapsed session rebuilds once and restarts
     * this rail from its head.
     */
    static armRailObserver(key: string): void {
        const state = this.rails.get(key);
        if (!state || state.done) return;
        const scroller = document.getElementById(homeRailScrollerId(key));
        const sentinel = document.getElementById(homeRailSentinelId(key));
        if (!scroller || !sentinel || typeof IntersectionObserver === 'undefined') return;
        if (state.observer) {
            try {
                state.observer.disconnect();
            } catch {
                // Ignore harness shims.
            }
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) void this.appendRailBatch(key);
                }
            },
            { root: scroller, threshold: 0.1 }
        );
        state.observer = observer;
        observer.observe(sentinel);
    }

    static paintSentinel(key: string, mode: 'loading' | 'idle' | 'retry' | 'end'): void {
        const sentinel = document.getElementById(homeRailSentinelId(key));
        if (!sentinel) return;
        sentinel.innerHTML = getRailSentinelHTML(key, mode, State.lang);
        if (mode === 'retry') this.wireRetryButton(key);
    }

    static wireRetryButton(key: string): void {
        const section = document.getElementById(homeRailSectionId(key));
        if (!section) return;
        const btn = section.querySelector('[data-home-rail-retry]');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const state = this.rails.get(key);
            if (state && state.sessionId) {
                // A live rail retries the SAME cursor (no double append).
                this.paintSentinel(key, 'loading');
                void this.appendRailBatch(key);
            } else {
                // A never-opened rail re-freezes from the head.
                void this.reopenRailSection(key);
            }
        });
    }

    /**
     * Rect-based visibility of a rail sentinel inside its own scroller
     * (direction-agnostic: works for RTL negative offsets and LTR alike).
     */
    static isRailSentinelVisible(key: string): boolean {
        const scroller = document.getElementById(homeRailScrollerId(key));
        const sentinel = document.getElementById(homeRailSentinelId(key));
        if (!scroller || !sentinel) return false;
        const view = scroller.getBoundingClientRect();
        const box = sentinel.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return false;
        const horizontal = box.left < view.right && box.right > view.left;
        const vertical = box.top < view.bottom && box.bottom > view.top;
        return horizontal && vertical;
    }

    static async appendRailBatch(key: string): Promise<void> {
        const state = this.rails.get(key);
        if (!state || state.loading || state.done) return;
        if (state.generation !== this.railGeneration) return;
        const sid = state.sessionId;
        if (!sid) return;
        const scroller = document.getElementById(homeRailScrollerId(key));
        const sentinel = document.getElementById(homeRailSentinelId(key));
        if (!scroller || !sentinel) return;
        state.loading = true;
        this.paintSentinel(key, 'loading');
        // Follow-up chaining flag: set ONLY on a successful batch that
        // advanced the cursor with more rows behind it (see below).
        let chainVisible = false;
        try {
            const prevCursor = state.cursor;
            const page = await this.readRailPage(sid, state, state.cursor);
            // Discard late responses from a superseded context.
            if (state.generation !== this.railGeneration || this.rails.get(key) !== state) return;
            if (page === null) {
                this.paintSentinel(key, 'retry');
                return;
            }
            if ('lapsed' in page) {
                if (!state.recreated) {
                    state.recreated = true;
                    await this.restartRail(key);
                } else {
                    this.paintSentinel(key, 'retry');
                }
                return;
            }
            const fresh: RailCard[] = [];
            for (const item of page.items) {
                const itemId = this.itemKey(item);
                if (state.seen.has(itemId)) continue;
                state.seen.add(itemId);
                fresh.push(item);
            }
            if (fresh.length > 0) {
                const html = fresh
                    .map((item) => getCompetitionCard(item as unknown as CompetitionCardProps, State.lang))
                    .join('');
                sentinel.insertAdjacentHTML('beforebegin', html);
            }
            state.cursor = page.nextCursor;
            state.done = !page.hasMore;
            this.paintSentinel(key, state.done ? 'end' : 'idle');
            if (state.done && state.observer) {
                try {
                    state.observer.disconnect();
                } catch {
                    // Ignore harness shims.
                }
                state.observer = null;
            }
            if (!state.done && state.cursor !== prevCursor) {
                // After an append the sentinel can stay intersecting (scroll
                // anchoring keeps it in view), in which case
                // IntersectionObserver delivers NO new event and the rail
                // would stall silently short of exhaustion. Re-arm for a
                // fresh notification AND continue at once while it is still
                // visible. Progress-gated (cursor advanced) so a stuck
                // cursor can never spin; the loading flag (reset in
                // `finally` below, before the chained call runs) forbids
                // concurrent duplicate fetches.
                this.armRailObserver(key);
                chainVisible = this.isRailSentinelVisible(key);
            }
        } catch (err) {
            console.error('[HomePage] rail continuation failed:', key, err);
            if (state.generation === this.railGeneration) this.paintSentinel(key, 'retry');
        } finally {
            state.loading = false;
        }
        if (
            chainVisible &&
            !state.done &&
            !state.loading &&
            state.generation === this.railGeneration &&
            this.rails.get(key) === state
        ) {
            void this.appendRailBatch(key);
        }
    }

    /**
     * Re-freeze a lapsed rail once and restart it from its head: the old
     * snapshot is discarded (seen set reset), never merged with the new one.
     */
    static async restartRail(key: string): Promise<void> {
        const state = this.rails.get(key);
        if (!state) return;
        const generation = state.generation;
        const opened = await this.openRail(state);
        if (generation !== this.railGeneration || this.rails.get(key) !== state) return;
        const scroller = document.getElementById(homeRailScrollerId(key));
        if (!scroller) return;
        if (opened === null || opened.items.length === 0) {
            this.paintSentinel(key, 'retry');
            return;
        }
        state.sessionId = opened.sessionId;
        state.cursor = opened.cursor;
        state.done = opened.done;
        state.seen = new Set<string | number>();
        const cards: string[] = [];
        for (const item of opened.items) {
            state.seen.add(this.itemKey(item));
            cards.push(getCompetitionCard(item as unknown as CompetitionCardProps, State.lang));
        }
        const sentinel = document.getElementById(homeRailSentinelId(key));
        const sentinelHtml = sentinel ? sentinel.outerHTML : '';
        scroller.innerHTML = cards.join('') + sentinelHtml;
        this.paintSentinel(key, state.done ? 'end' : 'idle');
        // innerHTML replaced the observed sentinel node: the old observer
        // watches a detached node, so drop it and observe the fresh one.
        if (state.observer) {
            try {
                state.observer.disconnect();
            } catch {
                // Ignore harness shims.
            }
            state.observer = null;
        }
        this.armRailObserver(key);
    }

    /**
     * Re-open a rail whose section never painted (explicit retry state):
     * freeze a fresh session and swap the whole section.
     */
    static async reopenRailSection(key: string): Promise<void> {
        const section = document.getElementById(homeRailSectionId(key));
        if (!section) return;
        const generation = this.railGeneration;
        const def = this.lastDefs.find((d) => d.key === key);
        if (!def) return;
        const opened = await this.openRail(def);
        if (generation !== this.railGeneration) return;
        if (opened === null || opened.items.length === 0) return;
        const cardsHtml = opened.items
            .map((item) => getCompetitionCard(item as unknown as CompetitionCardProps, State.lang))
            .join('');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = getHomeRailSection({
            railKey: def.key,
            title: def.title,
            icon: def.icon,
            lang: State.lang,
            color: def.color,
            cardsHtml,
            sentinelMode: opened.done ? 'end' : 'idle',
            viewAllHref: railViewAllHref({
                kind: def.kind,
                category: def.category,
                subcategory: def.subcategory,
                status: def.status,
                lang: State.lang,
            }),
        });
        const fresh = wrapper.firstElementChild;
        if (!fresh) return;
        section.replaceWith(fresh);
        const state: RailState = {
            ...def,
            sessionId: opened.sessionId,
            cursor: opened.cursor,
            done: opened.done,
            loading: false,
            seen: new Set<string | number>(),
            recreated: true,
            generation,
            observer: null,
        };
        for (const item of opened.items) state.seen.add(this.itemKey(item));
        this.rails.set(def.key, state);
        this.setupAllHoverScroll();
        this.armRailObserver(def.key);
    }

    /** Last painted rail definitions (for error-section retries). */
    static lastDefs: RailDef[] = [];

    static setMainTab(tab: 'live' | 'upcoming' | 'recorded') {
        // R3-RAILS-1A: guests SEE the Upcoming rail (visibility only — invite
        // and join actions keep their own auth guards, untouched here).
        this.currentMainTab = tab;
        const liveTab = document.getElementById('tab-live');
        const upcomingTab = document.getElementById('tab-upcoming');
        const recordedTab = document.getElementById('tab-recorded');

        const tr = translations[getUILanguage(State.lang)];

        if (liveTab) {
            liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive cursor-pointer';
            liveTab.innerHTML = `<span class="w-2 h-2 rounded-full bg-gray-400"></span> ${tr.live}`;
        }
        if (upcomingTab) upcomingTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive cursor-pointer';
        if (recordedTab) recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive cursor-pointer';

        if (tab === 'live' && liveTab) {
            liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active cursor-pointer';
            liveTab.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span> ${tr.live}`;
        } else if (tab === 'upcoming' && upcomingTab) {
            upcomingTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active cursor-pointer';
        } else if (tab === 'recorded' && recordedTab) {
            recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active cursor-pointer';
        }

        this.loadCompetitions();
    }

    static setSubTab(tab: string) {
        this.currentSubTab = tab;
        const tabs = ['all', 'dialogue', 'science', 'talents'];
        tabs.forEach(t => {
            const el = document.getElementById('subtab-' + t);
            if (el) {
                el.className = t === tab
                    ? 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-active cursor-pointer'
                    : 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive cursor-pointer';
            }
        });

        this.loadCompetitions();
    }

    static bindSearchEvents() {
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        const searchDropdown = document.getElementById('searchDropdown');
        const searchResults = document.getElementById('searchResults');

        if (searchInput && searchDropdown && searchResults) {
            searchInput.addEventListener('input', (e: Event) => {
                clearTimeout(this.searchTimeout);
                const query = (e.target as HTMLInputElement).value.trim();

                if (query.length >= 2) {
                    searchDropdown.classList.remove('hidden');
                    searchResults.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin text-purple-500"></i></div>';

                    this.searchTimeout = setTimeout(async () => {
                        try {
                            // Fetch both competitions and users in parallel
                            const [compRes, userRes] = await Promise.all([
                                fetch('/api/search/competitions?q=' + encodeURIComponent(query) + '&limit=5'),
                                fetch('/api/search/users?q=' + encodeURIComponent(query) + '&limit=3')
                            ]);
                            const compData = (await compRes.json()) as any;
                            const userData = (await userRes.json()) as any;

                            this.showSearchResults(
                                compData.data?.items || [],
                                userData.data?.items || [],
                                searchResults
                            );
                        } catch (err) {
                            searchResults.innerHTML = '<div class="p-4 text-center text-red-500 text-sm">Error loading results</div>';
                        }
                    }, 300);
                } else {
                    searchDropdown.classList.add('hidden');
                }
            });

            searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.performSearch();
                } else if (e.key === 'Escape') {
                    searchDropdown.classList.add('hidden');
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                const target = e.target as Node;
                if (!searchInput.contains(target) && !searchDropdown.contains(target)) {
                    searchDropdown.classList.add('hidden');
                }
            });

            // Bind global function for button click
            (window as any).performSearch = () => this.performSearch();
        }
    }

    static performSearch() {
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        if (searchInput) {
            const query = searchInput.value.trim();
            if (query.length >= 2) {
                window.location.href = '/explore?search=' + encodeURIComponent(query) + '&lang=' + State.lang;
            }
        }
    }

    static showSearchResults(competitions: any[], users: any[], container: HTMLElement) {
        const lang = State.lang;
        const tr = translations[getUILanguage(lang)];

        if ((!competitions || competitions.length === 0) && (!users || users.length === 0)) {
            container.innerHTML = `
            <div class="p-4 text-center text-gray-400 text-sm">
              <i class="fas fa-search text-2xl mb-2"></i>
              <p>${tr.search?.no_results || 'No results found'}</p>
            </div>
          `;
            return;
        }

        let html = '';

        // Users section
        if (users && users.length > 0) {
            html += `<div class="p-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">${tr.users || 'Users'}</div>`;
            html += users.slice(0, 3).map((user: any) => `
              <a href="/profile/${user.username}?lang=${lang}" class="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}" alt="" class="w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">${user.display_name || user.username}</p>
                  <p class="text-xs text-gray-500">@${user.username}</p>
                </div>
              </a>
            `).join('');
        }

        // Competitions section
        if (competitions && competitions.length > 0) {
            html += `<div class="p-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase ${users?.length ? 'border-t border-gray-200 dark:border-gray-700 mt-1' : ''}">${tr.competitions || 'Competitions'}</div>`;
            html += competitions.slice(0, 5).map((item: any) => `
              <a href="/competition/${item.id}?lang=${lang}" class="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <div class="w-12 h-8 rounded bg-gradient-to-br ${item.category_id === 1 ? 'from-purple-500 to-indigo-600' : item.category_id === 2 ? 'from-cyan-500 to-blue-600' : 'from-amber-500 to-orange-600'} flex items-center justify-center">
                  <i class="fas fa-trophy text-white text-xs"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">${item.title}</p>
                  <p class="text-xs text-gray-500">${item.creator_name || 'Unknown'}</p>
                </div>
              </a>
            `).join('');
        }

        // View all link
        html += `
          <a href="/explore?search=${encodeURIComponent((document.getElementById('searchInput') as HTMLInputElement).value)}&lang=${lang}" class="block p-3 text-center text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-t border-gray-200 dark:border-gray-700">
            ${tr.view_all || 'View all results'}
          </a>
        `;

        container.innerHTML = html;
    }

    static renderEmptyState(tr: any): string {
        return `
            <div class="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
              <div class="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                <i class="fas fa-search text-gray-400 text-3xl"></i>
              </div>
              <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${tr.no_competitions || 'No competitions found'}</h3>
              <p class="text-gray-500 max-w-md">${tr.try_adjusting_filters || 'Try adjusting your search or filters to find what you are looking for.'}</p>
            </div>
        `;
    }

    /**
     * Setup hover scroll for all section containers
     * Enables edge-hover scrolling on desktop
     */
    static setupAllHoverScroll() {
        const scrollContainers = document.querySelectorAll('[id$="-scroll"]');
        const isRTL = State.lang === 'ar' || State.lang === 'he';

        scrollContainers.forEach((container) => {
            const wrapper = container.parentElement;
            if (!wrapper) return;

            let scrollInterval: ReturnType<typeof setInterval> | null = null;
            const scrollSpeed = 8; // Pixels per frame

            wrapper.addEventListener('mousemove', (e: Event) => {
                const mouseEvent = e as MouseEvent;
                const rect = wrapper.getBoundingClientRect();
                const x = mouseEvent.clientX - rect.left;
                const width = rect.width;

                // Clear any existing interval
                if (scrollInterval) {
                    clearInterval(scrollInterval);
                    scrollInterval = null;
                }

                // Edge zone is 10% of width on each side
                const edgeZone = width * 0.1;

                if (x > width - edgeZone) {
                    // Mouse is in RIGHT edge zone
                    // LTR: scroll right (positive) to see more
                    // RTL: scroll left (positive, toward start)
                    scrollInterval = setInterval(() => {
                        (container as HTMLElement).scrollBy({ left: scrollSpeed });
                    }, 16);
                } else if (x < edgeZone) {
                    // Mouse is in LEFT edge zone
                    // LTR: scroll left (negative) to go back
                    // RTL: scroll right (negative) to see more content
                    scrollInterval = setInterval(() => {
                        (container as HTMLElement).scrollBy({ left: -scrollSpeed });
                    }, 16);
                }
            });

            wrapper.addEventListener('mouseleave', () => {
                if (scrollInterval) {
                    clearInterval(scrollInterval);
                    scrollInterval = null;
                }
            });
        });
    }
}
