/**
 * @file src/client/ui/CountdownTimer.ts
 * @description Universal countdown timers matching server-side lifecycle rules
 * @module client/ui/CountdownTimer
 *
 * Task 8: Competition Lifecycle & Strict Timers
 * - Instant: "Time left to join: 59:59"
 * - Scheduled: "Time to start: 59:59"
 * - Live: "Broadcast ends in 01:59:59"
 *
 * Rules match server ScheduledTaskService:
 * - Rule A: Instant competitions deleted after 1 hour without opponent
 * - Rule B: Scheduled competitions cancelled 1 hour post-schedule without starting
 * - Rule C: Live broadcasts auto-terminate after 2 hours max
 */

import { t } from '../../i18n';
import { State } from '../core/State';

export interface TimerConfig {
    type: 'instant_join' | 'scheduled_start' | 'live_max';
    deadline: string;
    competitionId: number;
    onExpired?: () => void;
}

export class CountdownTimer {
    private static instances: Map<number, CountdownTimer> = new Map();
    private static styleInjected: boolean = false;

    private config: TimerConfig;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private elementId: string;
    private lang: string;

    private constructor(config: TimerConfig) {
        this.config = config;
        this.elementId = `countdown-timer-${config.competitionId}`;
        this.lang = State.lang;
    }

    /**
     * Create or get an existing timer instance
     */
    static create(config: TimerConfig): CountdownTimer {
        const existing = this.instances.get(config.competitionId);
        if (existing) {
            existing.destroy();
        }
        const instance = new CountdownTimer(config);
        this.instances.set(config.competitionId, instance);
        return instance;
    }

    /**
     * Render the timer HTML and start the countdown
     */
    render(): string {
        this.injectStyles();

        const deadline = new Date(this.config.deadline).getTime();
        const remaining = deadline - Date.now();

        if (remaining <= 0) {
            return this.renderExpired();
        }

        const label = this.getLabel();
        const initialTime = this.formatTime(remaining);
        const urgencyClass = this.getUrgencyClass(remaining);

        return `
            <div id="${this.elementId}" class="countdown-timer ${urgencyClass}" data-deadline="${this.config.deadline}" data-type="${this.config.type}">
                <div class="countdown-inner">
                    <i class="fas ${this.getIcon()} countdown-icon"></i>
                    <span class="countdown-label">${label}</span>
                    <span class="countdown-digits" id="${this.elementId}-digits">${initialTime}</span>
                </div>
                <div class="countdown-bar-track">
                    <div class="countdown-bar-fill" id="${this.elementId}-bar" style="width: 100%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Start the countdown interval after element is in DOM
     */
    start(): void {
        const element = document.getElementById(this.elementId);
        if (!element) return;

        const deadline = new Date(this.config.deadline).getTime();
        const totalDuration = this.getTotalDuration();

        this.intervalId = setInterval(() => {
            const now = Date.now();
            const remaining = deadline - now;

            if (remaining <= 0) {
                this.destroy();
                this.renderExpiredState();
                if (this.config.onExpired) this.config.onExpired();
                return;
            }

            const digitsEl = document.getElementById(`${this.elementId}-digits`);
            const barEl = document.getElementById(`${this.elementId}-bar`);
            const timerEl = document.getElementById(this.elementId);

            if (digitsEl) {
                digitsEl.textContent = this.formatTime(remaining);
            }

            if (barEl) {
                const percent = Math.max(0, (remaining / totalDuration) * 100);
                barEl.style.width = `${percent}%`;
            }

            if (timerEl) {
                timerEl.className = `countdown-timer ${this.getUrgencyClass(remaining)}`;
            }
        }, 1000);
    }

    /**
     * Destroy the timer
     */
    destroy(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        CountdownTimer.instances.delete(this.config.competitionId);
    }

    private getLabel(): string {
        switch (this.config.type) {
            case 'instant_join':
                return t('timers.time_to_join', this.lang);
            case 'scheduled_start':
                return t('timers.time_to_start', this.lang);
            case 'live_max':
                return t('timers.broadcast_ends_in', this.lang);
            default:
                return '';
        }
    }

    private getIcon(): string {
        switch (this.config.type) {
            case 'instant_join':
                return 'fa-user-clock';
            case 'scheduled_start':
                return 'fa-hourglass-half';
            case 'live_max':
                return 'fa-broadcast-tower';
            default:
                return 'fa-clock';
        }
    }

    private getTotalDuration(): number {
        switch (this.config.type) {
            case 'instant_join':
                return 60 * 60 * 1000;
            case 'scheduled_start':
                return 60 * 60 * 1000;
            case 'live_max':
                return 2 * 60 * 60 * 1000;
            default:
                return 60 * 60 * 1000;
        }
    }

    private formatTime(ms: number): string {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pad = (n: number) => String(n).padStart(2, '0');

        if (this.config.type === 'live_max' || totalSeconds >= 3600) {
            return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }
        return `${pad(minutes)}:${pad(seconds)}`;
    }

    private getUrgencyClass(remaining: number): string {
        const totalDuration = this.getTotalDuration();
        const ratio = remaining / totalDuration;

        if (ratio < 0.1) return 'countdown-critical';
        if (ratio < 0.25) return 'countdown-warning';
        return 'countdown-normal';
    }

    private renderExpired(): string {
        return `
            <div id="${this.elementId}" class="countdown-timer countdown-expired">
                <div class="countdown-inner">
                    <i class="fas fa-exclamation-triangle countdown-icon"></i>
                    <span class="countdown-label">${t('timers.expired', this.lang)}</span>
                </div>
            </div>
        `;
    }

    private renderExpiredState(): void {
        const element = document.getElementById(this.elementId);
        if (element) {
            element.outerHTML = this.renderExpired();
        }
    }

    /**
     * Inject CSS styles once
     */
    private injectStyles(): void {
        if (CountdownTimer.styleInjected) return;
        CountdownTimer.styleInjected = true;

        const style = document.createElement('style');
        style.id = 'countdownTimerStyles';
        style.textContent = `
            .countdown-timer {
                border-radius: 16px;
                padding: 10px 16px;
                transition: all 0.3s ease;
                overflow: hidden;
            }

            .countdown-inner {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }

            .countdown-icon {
                font-size: 14px;
            }

            .countdown-label {
                font-size: 12px;
                font-weight: 600;
                opacity: 0.9;
            }

            .countdown-digits {
                font-size: 16px;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
                letter-spacing: 1px;
                margin-left: auto;
            }

            .countdown-bar-track {
                height: 3px;
                border-radius: 2px;
                overflow: hidden;
                opacity: 0.6;
            }

            .countdown-bar-fill {
                height: 100%;
                border-radius: 2px;
                transition: width 1s linear;
            }

            /* Normal state */
            .countdown-normal {
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.2);
                color: #8B5CF6;
            }
            .countdown-normal .countdown-bar-track { background: rgba(139, 92, 246, 0.2); }
            .countdown-normal .countdown-bar-fill { background: #8B5CF6; }

            /* Warning state */
            .countdown-warning {
                background: rgba(245, 158, 11, 0.1);
                border: 1px solid rgba(245, 158, 11, 0.2);
                color: #F59E0B;
                animation: countdown-pulse-warning 2s ease-in-out infinite;
            }
            .countdown-warning .countdown-bar-track { background: rgba(245, 158, 11, 0.2); }
            .countdown-warning .countdown-bar-fill { background: #F59E0B; }

            /* Critical state */
            .countdown-critical {
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #EF4444;
                animation: countdown-pulse-critical 1s ease-in-out infinite;
            }
            .countdown-critical .countdown-bar-track { background: rgba(239, 68, 68, 0.2); }
            .countdown-critical .countdown-bar-fill { background: #EF4444; }

            /* Expired state */
            .countdown-expired {
                background: rgba(107, 114, 128, 0.1);
                border: 1px solid rgba(107, 114, 128, 0.2);
                color: #6B7280;
            }

            @keyframes countdown-pulse-warning {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.85; }
            }

            @keyframes countdown-pulse-critical {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.9; transform: scale(1.01); }
            }

            /* Dark mode adjustments */
            .dark .countdown-normal {
                background: rgba(139, 92, 246, 0.15);
                border-color: rgba(139, 92, 246, 0.3);
            }
            .dark .countdown-warning {
                background: rgba(245, 158, 11, 0.15);
                border-color: rgba(245, 158, 11, 0.3);
            }
            .dark .countdown-critical {
                background: rgba(239, 68, 68, 0.15);
                border-color: rgba(239, 68, 68, 0.3);
            }
            .dark .countdown-expired {
                background: rgba(107, 114, 128, 0.15);
                border-color: rgba(107, 114, 128, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Register global window functions
     */
    static registerGlobals(): void {
        (window as any).CountdownTimer = CountdownTimer;
        (window as any).createCountdownTimer = (config: TimerConfig) => {
            const timer = CountdownTimer.create(config);
            const html = timer.render();
            return { html, start: () => timer.start(), destroy: () => timer.destroy() };
        };
    }
}

CountdownTimer.registerGlobals();

export default CountdownTimer;
