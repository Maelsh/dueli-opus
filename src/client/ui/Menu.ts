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
    triggerBottom: number;
}

export interface CountryMenuPosition {
    left: number;
    top: number;
    safeMargin: number;
    /** Vertical gap kept between the globe button and the menu. */
    triggerGap: number;
    atTrigger: boolean;
    centeredFallback: boolean;
    /** True only when the menu starts strictly below the globe button. */
    belowTrigger: boolean;
}

/** Vertical gap between the globe button's bottom edge and the menu's top. */
export const COUNTRY_MENU_TRIGGER_GAP = 8;

/**
 * Position beneath the globe trigger, then clamp both viewport edges.
 *
 * The menu is always anchored BELOW `triggerBottom + COUNTRY_MENU_TRIGGER_GAP`,
 * so it can never cover the globe button regardless of direction or width.
 */
export function computeCountryMenuPosition(metrics: CountryMenuMetrics): CountryMenuPosition {
    const viewportWidth = Number.isFinite(metrics.viewportWidth) && metrics.viewportWidth > 0
        ? metrics.viewportWidth
        : 1024;
    const menuWidth = Number.isFinite(metrics.menuWidth) && metrics.menuWidth > 0
        ? metrics.menuWidth
        : 320;
    const safeMargin = 16;
    const triggerGap = COUNTRY_MENU_TRIGGER_GAP;
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

    // Vertical: always strictly below the globe button, never above it and
    // never covering it, regardless of direction or available space.
    const triggerBottom = Number.isFinite(metrics.triggerBottom) && metrics.triggerBottom > 0
        ? metrics.triggerBottom
        : 64;
    const top = Math.max(triggerBottom + triggerGap, safeMargin);

    return {
        left,
        top,
        safeMargin,
        triggerGap,
        atTrigger: !centeredFallback && left === naturalLeft,
        centeredFallback,
        belowTrigger: top >= triggerBottom + triggerGap,
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
            if (isHidden) {
                // Take the panel out of the header's layout flow BEFORE it becomes
                // visible: an in-flow panel re-measures the header row and shifts
                // the globe button, which then made the panel cover that button.
                menu.style.position = 'fixed';
                menu.style.right = 'auto';
                menu.style.bottom = 'auto';
                menu.style.transform = 'none';
                menu.classList.remove('hidden');
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
            } else {
                menu.classList.add('hidden');
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
                triggerBottom: triggerRect?.bottom || 64,
                direction,
            });

            menu.style.position = 'fixed';
            menu.style.width = `${Math.round(menuWidth)}px`;
            menu.style.left = `${Math.round(position.left)}px`;
            // Always below the globe button: top >= trigger.bottom + gap.
            menu.style.top = `${Math.round(position.top)}px`;
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

