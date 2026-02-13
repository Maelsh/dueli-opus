/**
 * Toast Notification System
 * نظام الإشعارات المنبثقة
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
    duration?: number;
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
    dismissible?: boolean;
}

export class Toast {
    private container: HTMLElement | null = null;
    private rtl: boolean = false;

    constructor(rtl: boolean = false) {
        this.rtl = rtl;
        this.createContainer();
    }

    private createContainer() {
        if (typeof document === 'undefined') return;
        
        // Remove existing container
        const existing = document.getElementById('toast-container');
        if (existing) existing.remove();

        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = `fixed z-50 flex flex-col gap-2 p-4 ${this.getPositionClasses()}`;
        document.body.appendChild(this.container);
    }

    private getPositionClasses(): string {
        // Default to top-right for LTR, top-left for RTL
        return this.rtl ? 'top-4 left-4 items-start' : 'top-4 right-4 items-end';
    }

    private getIcon(type: ToastType): string {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info': return 'fa-info-circle';
            default: return 'fa-info-circle';
        }
    }

    private getColors(type: ToastType): string {
        switch (type) {
            case 'success': return 'bg-emerald-500 text-white';
            case 'error': return 'bg-red-500 text-white';
            case 'warning': return 'bg-amber-500 text-white';
            case 'info': return 'bg-blue-500 text-white';
            default: return 'bg-gray-500 text-white';
        }
    }

    show(message: string, type: ToastType = 'info', options: ToastOptions = {}) {
        if (!this.container) return;

        const {
            duration = 5000,
            dismissible = true
        } = options;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `
            flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg 
            transform transition-all duration-300 translate-x-full opacity-0
            min-w-[300px] max-w-[400px]
            ${this.getColors(type)}
        `;

        toast.innerHTML = `
            <i class="fas ${this.getIcon(type)} text-lg"></i>
            <span class="flex-1 text-sm font-medium">${message}</span>
            ${dismissible ? `
                <button class="opacity-70 hover:opacity-100 transition-opacity" onclick="this.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        `;

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                this.dismiss(toast);
            }, duration);
        }

        return toast;
    }

    private dismiss(toast: HTMLElement) {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    // Convenience methods
    success(message: string, options?: ToastOptions) {
        return this.show(message, 'success', options);
    }

    error(message: string, options?: ToastOptions) {
        return this.show(message, 'error', { ...options, duration: 8000 });
    }

    warning(message: string, options?: ToastOptions) {
        return this.show(message, 'warning', options);
    }

    info(message: string, options?: ToastOptions) {
        return this.show(message, 'info', options);
    }
}

// Global toast instance
let globalToast: Toast | null = null;

export function initToast(rtl: boolean = false): Toast {
    globalToast = new Toast(rtl);
    return globalToast;
}

export function getToast(): Toast | null {
    return globalToast;
}

// Helper for pages to use
export function showToast(message: string, type: ToastType = 'info', options?: ToastOptions) {
    if (globalToast) {
        return globalToast.show(message, type, options);
    }
    console.warn('Toast not initialized');
    return null;
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).DueliToast = {
        init: initToast,
        get: getToast,
        show: showToast,
        success: (msg: string, opts?: ToastOptions) => showToast(msg, 'success', opts),
        error: (msg: string, opts?: ToastOptions) => showToast(msg, 'error', opts),
        warning: (msg: string, opts?: ToastOptions) => showToast(msg, 'warning', opts),
        info: (msg: string, opts?: ToastOptions) => showToast(msg, 'info', opts),
    };
}
