/**
 * @file src/client/ui/Menu.ts
 * @description إدارة القوائم المنسدلة
 * @module client/ui/Menu
 */

export interface CountryMenuMetrics {
    viewportWidth: number;
    menuWidth: number;
    triggerLeft: number;
    triggerRight: number;
    direction: 'rtl' | 'ltr';
}

export interface CountryMenuPosition {
    left: number;
    top: number;
    safeMargin: number;
    atTrigger: boolean;
    centeredFallback: boolean;
}

/** Position beneath the globe trigger, then clamp both viewport edges. */
export function computeCountryMenuPosition(metrics: CountryMenuMetrics): CountryMenuPosition {
    const viewportWidth = Number.isFinite(metrics.viewportWidth) && metrics.viewportWidth > 0
        ? metrics.viewportWidth
        : 1024;
    const menuWidth = Number.isFinite(metrics.menuWidth) && metrics.menuWidth > 0
        ? metrics.menuWidth
        : 320;
    const safeMargin = 16;
    const available = Math.max(0, viewportWidth - (safeMargin * 2));
    const centeredFallback = viewportWidth < 640 || menuWidth >= available;
    const naturalLeft = metrics.direction === 'rtl'
        ? metrics.triggerRight - menuWidth
        : metrics.triggerLeft;
    const minLeft = centeredFallback ? 0 : safeMargin;
    const maxLeft = centeredFallback
        ? 0
        : Math.max(safeMargin, viewportWidth - menuWidth - safeMargin);
    const left = centeredFallback
        ? Math.max(0, (viewportWidth - menuWidth) / 2)
        : Math.min(Math.max(naturalLeft, minLeft), maxLeft);

    return {
        left,
        top: 0,
        safeMargin,
        atTrigger: !centeredFallback && left === naturalLeft,
        centeredFallback,
    };
}

/**
 * Menu Management Class
 * إدارة القوائم المنسدلة
 */
export class Menu {
    /**
     * Toggle user menu
     */
    static toggleUser(): void {
        const menu = document.getElementById('userMenu');
        if (menu) {
            // Use 'show' class to match CSS transitions (opacity/visibility)
            menu.classList.toggle('show');
        }
    }

    /**
     * Toggle country menu
     */
    static toggleCountry(): void {
        const menu = document.getElementById('countryMenu');
        if (menu) {
            const isHidden = menu.classList.contains('hidden');
            menu.classList.toggle('hidden');

            if (isHidden) {
                this.positionCountryMenu();
                // Populate countries list when opening
                if (typeof (window as any).filterCountries === 'function') {
                    (window as any).filterCountries('');
                }
                // Focus search input when opening
                setTimeout(() => {
                    const searchInput = document.getElementById('countrySearch') as HTMLInputElement;
                    if (searchInput) searchInput.focus();
                }, 100);
            }
        }
    }

    /**
     * Anchor the dropdown to the globe's real viewport position, then clamp
     * its horizontal position inside the header's safe margin.
     */
    static positionCountryMenu(): void {
        try {
            const menu = document.getElementById('countryMenu') as HTMLElement | null;
            const trigger = document.getElementById('countryButton');
            if (!menu || !trigger || typeof window === 'undefined') return;

            const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
            const menuRect = menu.getBoundingClientRect?.();
            const triggerRect = trigger.getBoundingClientRect?.();
            const requestedWidth = (menuRect && menuRect.width > 0 ? menuRect.width : menu.offsetWidth) || 320;
            const menuWidth = Math.min(requestedWidth, Math.max(0, viewportWidth - (16 * 2)));
            const direction = document.documentElement?.dir === 'rtl' ? 'rtl' : 'ltr';
            const position = computeCountryMenuPosition({
                viewportWidth,
                menuWidth,
                triggerLeft: triggerRect?.left || 0,
                triggerRight: triggerRect?.right || (triggerRect?.left || 0) + 32,
                direction,
            });

            menu.style.position = 'fixed';
            menu.style.width = `${Math.round(menuWidth)}px`;
            menu.style.left = `${Math.round(position.left)}px`;
            menu.style.top = `${Math.round((triggerRect?.bottom || 64) + 8)}px`;
            menu.style.transform = 'none';
            menu.style.setProperty('--country-safe-margin', `${position.safeMargin}px`);
        } catch {
            // Positioning is best-effort: never break menu open/close.
        }
    }

    /**
     * Close all menus
     */
    static closeAll(): void {
        const userMenu = document.getElementById('userMenu');
        const countryMenu = document.getElementById('countryMenu');
        const notificationsDropdown = document.getElementById('notificationsDropdown');

        // User menu uses 'show' class
        if (userMenu) userMenu.classList.remove('show');
        // Country menu uses 'hidden' class
        if (countryMenu) countryMenu.classList.add('hidden');
        // Notifications dropdown uses 'hidden' class
        if (notificationsDropdown) notificationsDropdown.classList.add('hidden');
    }

    /**
     * Setup click outside listener
     */
    static setupClickOutside(): void {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Country menu
            const countryBtn = target.closest('[data-csp-fn="toggleCountryMenu"], [onclick*="toggleCountryMenu"]');
            const countryMenu = document.getElementById('countryMenu');
            if (!countryBtn && countryMenu && !countryMenu.contains(target)) {
                countryMenu.classList.add('hidden');
            }

            // User menu - use 'show' class
            const userBtn = target.closest('[data-csp-fn="toggleUserMenu"], [onclick*="toggleUserMenu"]');
            const userMenu = document.getElementById('userMenu');
            if (!userBtn && userMenu && !userMenu.contains(target)) {
                userMenu.classList.remove('show');
            }

            // Notifications dropdown
            const notifBtn = target.closest('[data-csp-fn="toggleNotifications"], [onclick*="toggleNotifications"]');
            const notifDropdown = document.getElementById('notificationsDropdown');
            if (!notifBtn && notifDropdown && !notifDropdown.contains(target)) {
                notifDropdown.classList.add('hidden');
            }

            // Messages dropdown
            const msgBtn = target.closest('[data-csp-fn="toggleMessages"], [onclick*="toggleMessages"]');
            const msgDropdown = document.getElementById('messagesDropdown');
            if (!msgBtn && msgDropdown && !msgDropdown.contains(target)) {
                msgDropdown.classList.add('hidden');
            }
        });
    }
}

export default Menu;

