/**
 * @file src/client/ui/Toast.ts
 * @description إشعارات Toast
 * @module client/ui/Toast
 */

import { State } from '../core/State';
import { t, isRTL } from '../../i18n';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Toast Notification Class
 * إشعارات التنبيه
 */
export class Toast {
    /**
     * Show toast notification
     */
    static show(message: string, type: ToastType = 'info'): void {
        // Remove existing toast
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = isRTL(State.lang) ? 'left: 24px;' : 'right: 24px;';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show success toast
     */
    static success(message: string): void {
        this.show(message, 'success');
    }

    /**
     * Show error toast
     */
    static error(message: string): void {
        this.show(message, 'error');
    }

    /**
     * Show warning toast
     */
    static warning(message: string): void {
        this.show(message, 'warning');
    }

    /**
     * Show info toast
     */
    static info(message: string): void {
        this.show(message, 'info');
    }
}

export default Toast;
