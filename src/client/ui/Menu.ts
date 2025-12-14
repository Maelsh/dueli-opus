/**
 * @file src/client/ui/Menu.ts
 * @description إدارة القوائم المنسدلة
 * @module client/ui/Menu
 */

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
            const countryBtn = target.closest('[onclick*="toggleCountryMenu"]');
            const countryMenu = document.getElementById('countryMenu');
            if (!countryBtn && countryMenu && !countryMenu.contains(target)) {
                countryMenu.classList.add('hidden');
            }

            // User menu - use 'show' class
            const userBtn = target.closest('[onclick*="toggleUserMenu"]');
            const userMenu = document.getElementById('userMenu');
            if (!userBtn && userMenu && !userMenu.contains(target)) {
                userMenu.classList.remove('show');
            }

            // Notifications dropdown
            const notifBtn = target.closest('[onclick*="toggleNotifications"]');
            const notifDropdown = document.getElementById('notificationsDropdown');
            if (!notifBtn && notifDropdown && !notifDropdown.contains(target)) {
                notifDropdown.classList.add('hidden');
            }

            // Messages dropdown
            const msgBtn = target.closest('[onclick*="toggleMessages"]');
            const msgDropdown = document.getElementById('messagesDropdown');
            if (!msgBtn && msgDropdown && !msgDropdown.contains(target)) {
                msgDropdown.classList.add('hidden');
            }
        });
    }
}

export default Menu;

