
import { CompetitionService } from '../services/CompetitionService';
import { State } from '../core/State';
import { getCompetitionCard } from '../../shared/components/competition-card';
import { getCompetitionSection } from '../../shared/components/competition-section';
import { SUBCATEGORY_COLORS, SUBCATEGORY_ORDER, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_SUBCATEGORIES, SUBCATEGORY_ICONS } from '../../shared/constants';
import { translations, getUILanguage } from '../../i18n';

export class HomePage {
    static currentMainTab: 'live' | 'upcoming' | 'recorded' = 'live';
    static currentSubTab: string = 'all';
    static currentOffset: number = 0;
    static searchTimeout: ReturnType<typeof setTimeout>;
    /**
     * R3-GUEST-1: frozen guest suggestion session driving the «مقترح لك»
     * rail to real exhaustion. The end of results comes ONLY from the server
     * hasMore flag — never from batch length or client dedup.
     */
    static suggestedSessionId: string | null = null;
    static suggestedCursor: string | null = null;
    static suggestedDone: boolean = false;
    static suggestedLoading: boolean = false;
    static suggestedRecreated: boolean = false;
    static suggestedSeen: Set<string | number> = new Set();
    static suggestedObserver: IntersectionObserver | null = null;
    static readonly SUGGESTED_RAIL_ID = 'suggested-rail';
    static readonly SUGGESTED_BATCH = 15;

    static init() {
        // Show upcoming tab if user is logged in
        if (State.currentUser) {
            const upcomingTab = document.getElementById('tab-upcoming');
            if (upcomingTab) upcomingTab.classList.remove('hidden');
        }

        // Initial load
        this.loadCompetitions();
        this.bindSearchEvents();
    }

    static async loadCompetitions() {
        const container = document.getElementById('mainContent');
        if (!container) return;

        const lang = State.lang;
        const tr = translations[getUILanguage(lang)];

        container.innerHTML = '<div class="flex flex-col items-center justify-center py-16"><i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i></div>';

        // A re-render orphans any rail observer — tear it down first.
        this.teardownGuestRail();

        try {
            const params: any = { limit: 24 };
            if (this.currentMainTab === 'live') params.status = 'live';
            else if (this.currentMainTab === 'recorded') params.status = 'recorded';
            else if (this.currentMainTab === 'upcoming') params.status = 'upcoming';
            let guestRailArmed = false;

            // Check if upcoming tab should be visible (only for logged in users)
            const isUpcoming = this.currentMainTab === 'upcoming';
            if (isUpcoming && !State.currentUser) {
                this.setMainTab('live');
                return;
            }

            if (this.currentSubTab !== 'all') {
                params.category = this.currentSubTab;
            }

            const data = await CompetitionService.list(params);

            if (!data.success || !data.data?.length) {
                container.innerHTML = this.renderEmptyState(tr);
                return;
            }

            let html = '';

            if (this.currentSubTab !== 'all') {
                // Category tab (dialogue/science/talents): Fetch each subcategory separately
                const statusParam = this.currentMainTab === 'live' ? 'live' : this.currentMainTab === 'recorded' ? 'recorded' : 'upcoming';
                const subcategories = CATEGORY_SUBCATEGORIES[this.currentSubTab] || [];

                // Fetch all subcategories in parallel
                const subcategoryPromises = subcategories.map(subcat =>
                    CompetitionService.list({ status: statusParam, subcategory: subcat, limit: 15 })
                );

                const results = await Promise.all(subcategoryPromises);

                // Render each subcategory that has data
                subcategories.forEach((subcat, index) => {
                    const res = results[index];
                    if (res.success && res.data?.length > 0) {
                        const lookupSlug = subcat.replace(/-/g, '_');
                        const subName = (tr.categories as any)[lookupSlug] || (tr.categories as any)[subcat] || subcat;
                        const icon = SUBCATEGORY_ICONS[subcat] || 'fas fa-tag';
                        const color = SUBCATEGORY_COLORS[subcat] || '#8B5CF6';

                        html += getCompetitionSection(subName, res.data, icon, lang, color, false);
                    }
                });
            } else {
                // 'All' tab: Fetch 4 separate datasets for distinct sections
                const statusParam = this.currentMainTab === 'live' ? 'live' : this.currentMainTab === 'recorded' ? 'recorded' : 'upcoming';

                const [recommendedRes, dialogueRes, scienceRes, talentsRes] = await Promise.all([
                    this.fetchSuggested(statusParam),
                    CompetitionService.list({ status: statusParam, category: 'dialogue', limit: 15 }),
                    CompetitionService.list({ status: statusParam, category: 'science', limit: 15 }),
                    CompetitionService.list({ status: statusParam, category: 'talents', limit: 15 })
                ]);

                // Always render all 4 sections using fixed colors from constants
                if (recommendedRes.success && recommendedRes.data?.length > 0) {
                    if (recommendedRes.session) {
                        // Guest rail: stable anchor id so the scroll sentinel
                        // can append cursor batches after the first paint.
                        html += getCompetitionSection(tr.sections?.suggested || 'Recommended', recommendedRes.data, 'fas fa-fire', lang, '#8B5CF6', false, this.SUGGESTED_RAIL_ID);
                        guestRailArmed = true;
                    } else {
                        html += getCompetitionSection(tr.sections?.suggested || 'Recommended', recommendedRes.data, 'fas fa-fire', lang, '#8B5CF6', false);
                    }
                }

                if (dialogueRes.success && dialogueRes.data?.length > 0) {
                    html += getCompetitionSection(tr.categories['dialogue'] || 'Dialogue', dialogueRes.data, CATEGORY_ICONS['dialogue'], lang, CATEGORY_COLORS['dialogue'], false);
                }

                if (scienceRes.success && scienceRes.data?.length > 0) {
                    html += getCompetitionSection(tr.categories['science'] || 'Science', scienceRes.data, CATEGORY_ICONS['science'], lang, CATEGORY_COLORS['science'], false);
                }

                if (talentsRes.success && talentsRes.data?.length > 0) {
                    html += getCompetitionSection(tr.categories['talents'] || 'Talents', talentsRes.data, CATEGORY_ICONS['talents'], lang, CATEGORY_COLORS['talents'], false);
                }
            }

            if (!html) {
                html = this.renderEmptyState(tr);
            }

            // No Load More button - all subcategories rendered as separate rows

            container.innerHTML = html;

            // Setup hover scroll for all sections with scrollable containers
            this.setupAllHoverScroll();

            // Guest rail continuation starts only after the paint exists.
            if (guestRailArmed) {
                this.setupGuestRailScroll();
            }

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="text-center py-16 text-red-500">${tr.error_loading || 'Error loading content'}</div>`;
        }
    }

    /**
     * T2.3: Suggested section powered by the Recommendation Engine
     * (language > country > followed > newest > most viewed > top rated),
     * with graceful fallback to the plain list on any failure.
     *
     * R3-GUEST-1: logged-in callers keep this single-batch contract
     * untouched; guests go through fetchGuestSuggestedRail (frozen session +
     * scroll continuation to real exhaustion).
     */
    private static async fetchRecommended(statusParam: string): Promise<any> {
        try {
            const headers: Record<string, string> = {};
            if (State.sessionId) headers['Authorization'] = 'Bearer ' + State.sessionId;
            const res = await fetch(`/api/recommendations?limit=15&lang=${State.lang}`, { headers });
            const data: any = await res.json();
            if (data.success && data.data?.competitions?.length > 0) {
                return { success: true, data: data.data.competitions };
            }
        } catch (err) {
            console.error('[HomePage] recommendations failed, falling back:', err);
        }
        // Graceful degradation: plain list keeps the section non-empty
        return CompetitionService.list({ status: statusParam, limit: 15 });
    }

    /**
     * R3-GUEST-1: suggested-section dispatcher. Logged-in users keep the
     * single-batch contract above byte-for-byte; guests freeze a suggestion
     * session (first page returned here with its cursor envelope, the rail
     * continues it after the paint).
     */
    private static async fetchSuggested(statusParam: string): Promise<any> {
        if (State.sessionId) {
            return this.fetchRecommended(statusParam);
        }
        return this.fetchGuestSuggestedRail(statusParam);
    }

    private static guestHeaders(extra: Record<string, string>): Record<string, string> {
        const headers: Record<string, string> = { ...(extra || {}) };
        try {
            const guest = typeof localStorage !== 'undefined' ? localStorage.getItem('dueli_guest_token') : null;
            if (guest) headers['X-Guest-Token'] = guest;
        } catch {
            // Private mode: the server issues a token per call instead.
        }
        return headers;
    }

    private static storeGuestToken(token: unknown): void {
        if (typeof token !== 'string' || !token) return;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('dueli_guest_token', token);
        } catch {
            // Best-effort first-party persistence only.
        }
    }

    /**
     * R3-GUEST-1: freeze the guest suggestion session and read its first
     * page. Any failure degrades to the plain list (section stays non-empty,
     * no session state is armed).
     */
    private static async fetchGuestSuggestedRail(statusParam: string): Promise<any> {
        try {
            this.resetGuestRailState();
            const createRes = await fetch(`/api/recommendations/suggested-sessions?lang=${State.lang}`, {
                method: 'POST',
                headers: this.guestHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({}),
            });
            if (!createRes.ok) throw new Error('suggested session status ' + createRes.status);
            const created = (await createRes.json()) as {
                success?: unknown;
                data?: { session?: { id?: unknown }; guest_token?: unknown };
            };
            const sid = created?.success && created.data?.session?.id ? String(created.data.session.id) : '';
            if (!sid) throw new Error('no suggested session id');
            this.storeGuestToken(created.data?.guest_token);
            const page = await this.readSuggestedPage(sid, null);
            if (!page || page.items.length === 0) throw new Error('empty suggested first page');
            this.suggestedSessionId = sid;
            this.suggestedCursor = page.nextCursor;
            this.suggestedDone = !page.hasMore;
            for (const item of page.items) this.suggestedSeen.add(this.railKey(item));
            return { success: true, data: page.items, session: { id: sid } };
        } catch (err) {
            console.error('[HomePage] guest suggested session failed, falling back:', err);
            this.resetGuestRailState();
            return CompetitionService.list({ status: statusParam, limit: 15 });
        }
    }

    private static railKey(item: { id?: string | number }): string | number {
        return item && item.id !== undefined && item.id !== null ? item.id : Math.random();
    }

    private static async readSuggestedPage(
        sid: string,
        cursor: string | null
    ): Promise<{ items: Array<{ id?: string | number }>; nextCursor: string | null; hasMore: boolean } | null> {
        let url = `/api/recommendations/suggested-sessions/${encodeURIComponent(sid)}/page?limit=${this.SUGGESTED_BATCH}&lang=${State.lang}`;
        if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
        const res = await fetch(url, { headers: this.guestHeaders({}) });
        if (res.status === 410 || res.status === 404 || res.status === 409) {
            return null;
        }
        if (!res.ok) throw new Error('suggested page status ' + res.status);
        const data = (await res.json()) as {
            success?: unknown;
            data?: { items?: unknown; nextCursor?: unknown; hasMore?: unknown } | null;
        };
        const payload = data && data.success && data.data ? data.data : null;
        if (!payload || !Array.isArray(payload.items)) throw new Error('bad suggested payload');
        return {
            items: payload.items as Array<{ id?: string | number }>,
            nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
            hasMore: payload.hasMore === true,
        };
    }

    private static resetGuestRailState(): void {
        this.suggestedSessionId = null;
        this.suggestedCursor = null;
        this.suggestedDone = false;
        this.suggestedLoading = false;
        this.suggestedRecreated = false;
        this.suggestedSeen = new Set();
    }

    private static teardownGuestRail(): void {
        if (this.suggestedObserver) {
            try {
                this.suggestedObserver.disconnect();
            } catch {
                // Harness/shim without full observer support.
            }
            this.suggestedObserver = null;
        }
        const sentinel = document.getElementById('suggested-rail-sentinel');
        if (sentinel && sentinel.parentElement) sentinel.parentElement.removeChild(sentinel);
        this.resetGuestRailState();
    }

    /**
     * R3-GUEST-1: continue the frozen guest rail as the visitor scrolls it.
     * Each batch appends at the frozen cursor; a retry re-reads the SAME
     * cursor; the end comes ONLY from the server hasMore flag. A lapsed
     * session (410/404/409) freezes ONE fresh session and restarts the rail
     * from its head — never a silent stop, never a duplicate loop.
     */
    private static setupGuestRailScroll(): void {
        const scroller = document.getElementById(`${this.SUGGESTED_RAIL_ID}-scroll`);
        if (!scroller || typeof IntersectionObserver === 'undefined') return;
        if (this.suggestedDone) return;
        const sentinel = document.createElement('div');
        sentinel.id = 'suggested-rail-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.className = 'flex-shrink-0 w-24 flex items-center justify-center';
        sentinel.innerHTML = '<i class="fas fa-spinner fa-spin text-purple-400 text-xl"></i>';
        scroller.appendChild(sentinel);
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) void this.appendSuggestedBatch();
            }
        }, { root: scroller, threshold: 0.1 });
        this.suggestedObserver = observer;
        observer.observe(sentinel);
    }

    private static async appendSuggestedBatch(): Promise<void> {
        if (this.suggestedLoading || this.suggestedDone) return;
        const sid = this.suggestedSessionId;
        if (!sid) return;
        const scroller = document.getElementById(`${this.SUGGESTED_RAIL_ID}-scroll`);
        const sentinel = document.getElementById('suggested-rail-sentinel');
        if (!scroller || !sentinel) return;
        const tr = translations[getUILanguage(State.lang)];
        this.suggestedLoading = true;
        try {
            const page = await this.readSuggestedPage(sid, this.suggestedCursor);
            if (page === null) {
                // Lapsed session: exactly one fresh freeze, rail restarts.
                if (!this.suggestedRecreated) {
                    this.suggestedRecreated = true;
                    await this.restartGuestRail(scroller);
                } else {
                    this.failGuestRail(tr);
                }
                return;
            }
            const fresh: Array<{ id?: string | number }> = [];
            for (const item of page.items) {
                const key = this.railKey(item);
                if (this.suggestedSeen.has(key)) continue;
                this.suggestedSeen.add(key);
                fresh.push(item);
            }
            if (fresh.length > 0) {
                const html = fresh.map((item) => getCompetitionCard(item as never, State.lang)).join('');
                sentinel.insertAdjacentHTML('beforebegin', html);
            }
            this.suggestedCursor = page.nextCursor;
            this.suggestedDone = !page.hasMore;
            if (this.suggestedDone) {
                if (this.suggestedObserver) this.suggestedObserver.disconnect();
                this.suggestedObserver = null;
                if (sentinel.parentElement) sentinel.parentElement.removeChild(sentinel);
            }
        } catch (err) {
            console.error('[HomePage] suggested continuation failed:', err);
            this.failGuestRail(tr);
        } finally {
            this.suggestedLoading = false;
        }
    }

    private static failGuestRail(tr: { discovery?: { retry?: string } }): void {
        const sentinel = document.getElementById('suggested-rail-sentinel');
        if (!sentinel) return;
        sentinel.innerHTML = `<button type="button" data-suggested-retry="1" class="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm font-semibold">${
            (tr.discovery && tr.discovery.retry) || 'Retry'
        }</button>`;
        const btn = sentinel.querySelector('[data-suggested-retry]');
        if (btn) {
            btn.addEventListener('click', () => {
                sentinel.innerHTML = '<i class="fas fa-spinner fa-spin text-purple-400 text-xl"></i>';
                void this.appendSuggestedBatch();
            });
        }
    }

    private static async restartGuestRail(scroller: HTMLElement): Promise<void> {
        try {
            this.resetGuestRailState();
            const createRes = await fetch(`/api/recommendations/suggested-sessions?lang=${State.lang}`, {
                method: 'POST',
                headers: this.guestHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({}),
            });
            if (!createRes.ok) throw new Error('recreate status ' + createRes.status);
            const created = (await createRes.json()) as {
                success?: unknown;
                data?: { session?: { id?: unknown }; guest_token?: unknown };
            };
            const sid = created?.success && created.data?.session?.id ? String(created.data.session.id) : '';
            if (!sid) throw new Error('no recreated session id');
            this.storeGuestToken(created.data?.guest_token);
            const page = await this.readSuggestedPage(sid, null);
            if (!page) throw new Error('no recreated first page');
            this.suggestedSessionId = sid;
            this.suggestedCursor = page.nextCursor;
            this.suggestedDone = !page.hasMore;
            this.suggestedSeen = new Set();
            const cards: string[] = [];
            for (const item of page.items) {
                this.suggestedSeen.add(this.railKey(item));
                cards.push(getCompetitionCard(item as never, State.lang));
            }
            scroller.innerHTML = cards.join('');
            const sentinel = document.createElement('div');
            sentinel.id = 'suggested-rail-sentinel';
            sentinel.setAttribute('aria-hidden', 'true');
            sentinel.className = 'flex-shrink-0 w-24 flex items-center justify-center';
            sentinel.innerHTML = '<i class="fas fa-spinner fa-spin text-purple-400 text-xl"></i>';
            scroller.appendChild(sentinel);
            if (this.suggestedObserver) {
                try {
                    this.suggestedObserver.observe(sentinel);
                } catch {
                    // Fall through to button retry on next error.
                }
            }
            if (this.suggestedDone && sentinel.parentElement) {
                sentinel.parentElement.removeChild(sentinel);
            }
        } catch (err) {
            console.error('[HomePage] suggested rail restart failed:', err);
            const tr = translations[getUILanguage(State.lang)];
            this.failGuestRail(tr);
        }
    }

    static setMainTab(tab: 'live' | 'upcoming' | 'recorded') {        // Prevent accessing upcoming tab if not logged in
        if (tab === 'upcoming' && !State.currentUser) {
            tab = 'live'; // Fallback to live tab
        }

        this.currentMainTab = tab;
        const liveTab = document.getElementById('tab-live');
        const upcomingTab = document.getElementById('tab-upcoming');
        const recordedTab = document.getElementById('tab-recorded');

        const tr = translations[getUILanguage(State.lang)];

        // Determine if upcoming tab should stay hidden (for non-logged-in users)
        const upcomingHidden = !State.currentUser ? ' hidden' : '';

        if (liveTab) {
            liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive cursor-pointer';
            liveTab.innerHTML = `<span class="w-2 h-2 rounded-full bg-gray-400"></span> ${tr.live}`;
        }
        if (upcomingTab) upcomingTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive cursor-pointer' + upcomingHidden;
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

        this.currentOffset = 0;
        this.loadCompetitions();
    }

    static async loadMoreCompetitions() {
        const btn = document.getElementById('loadMoreBtn') as HTMLButtonElement;
        const tr = translations[getUILanguage(State.lang)];

        if (btn) {
            btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> ${tr.loading || 'Loading...'}`;
            btn.disabled = true;
        }

        this.currentOffset += 24;

        try {
            const params: any = {
                limit: 24,
                offset: this.currentOffset
            };

            if (this.currentMainTab === 'live') params.status = 'live';
            else if (this.currentMainTab === 'recorded') params.status = 'recorded';
            else if (this.currentMainTab === 'upcoming') params.status = 'upcoming';

            if (this.currentSubTab !== 'all') {
                params.category = this.currentSubTab;
            }

            const data = await CompetitionService.list(params);

            if (data.success && data.data?.length > 0) {
                if (btn && btn.parentElement) btn.parentElement.remove();

                const container = document.getElementById('mainContent');
                let newHtml = '';
                data.data.forEach((item: any) => {
                    newHtml += getCompetitionCard(item, State.lang);
                });

                newHtml = `<section class="animate-fade-in"><div class="flex overflow-x-auto pb-4 -mx-4 px-4 gap-4 scrollbar-hide snap-x snap-mandatory">${newHtml}</div></section>`;

                if (data.data.length >= 24) {
                    newHtml += `
                        <div class="text-center py-8">
                          <button data-csp-on="click" data-csp-fn="loadMoreCompetitions" data-csp-args='[]' id="loadMoreBtn" class="px-8 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-semibold transition-all">
                            <i class="fas fa-plus-circle mr-2"></i>
                            ${tr.load_more || 'Load More'}
                          </button>
                        </div>
                      `;
                }

                if (container) container.insertAdjacentHTML('beforeend', newHtml);
            } else {
                if (btn) {
                    btn.textContent = tr.no_more || 'No more results';
                    btn.classList.add('opacity-50', 'cursor-not-allowed');
                }
            }

        } catch (err) {
            console.error(err);
            if (btn) {
                btn.innerHTML = `<i class="fas fa-plus-circle mr-2"></i> ${tr.load_more || 'Load More'}`;
                btn.disabled = false;
            }
        }
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
