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
            menu.classList.toggle('hidden');
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

        if (userMenu) userMenu.classList.add('hidden');
        if (countryMenu) countryMenu.classList.add('hidden');
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

            // User menu
            const userBtn = target.closest('[onclick*="toggleUserMenu"]');
            const userMenu = document.getElementById('userMenu');
            if (!userBtn && userMenu && !userMenu.contains(target)) {
                userMenu.classList.add('hidden');
            }
        });
    }
}

export default Menu;
