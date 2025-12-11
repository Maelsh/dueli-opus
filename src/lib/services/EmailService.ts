/**
 * Email Service - خدمة البريد الإلكتروني
 * 
 * Handles all email sending functionality using Resend API
 * يتعامل مع جميع وظائف إرسال البريد الإلكتروني باستخدام Resend API
 */

import { translations, getUILanguage, isRTL, Language } from '../../i18n';

/**
 * Email template options
 */
export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

/**
 * Email Service Class
 * Encapsulates all email operations with Resend API
 */
export class EmailService {
    private readonly apiKey: string;
    private readonly apiUrl = 'https://api.resend.com/emails';
    private readonly fromAddress = 'Dueli <onboarding@resend.dev>';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Send email via Resend API
     */
    private async send(options: EmailOptions): Promise<any> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: this.fromAddress,
                to: [options.to],
                subject: options.subject,
                html: options.html
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Resend API Error:', errorText);
            throw new Error(`Failed to send email: ${errorText}`);
        }

        return response.json();
    }

    /**
     * Build HTML wrapper with RTL support
     */
    private buildHtmlWrapper(content: string, lang: Language): string {
        const rtl = isRTL(lang);
        return `
            <div ${rtl ? 'dir="rtl"' : ''} style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                ${content}
            </div>
        `;
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(
        email: string,
        token: string,
        name: string,
        lang: Language,
        origin: string
    ): Promise<any> {
        const baseUrl = origin || 'https://project-8e7c178d.pages.dev';
        const verifyUrl = `${baseUrl}/verify?token=${token}&lang=${lang}`;
        const tr = translations[getUILanguage(lang)];

        const content = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #7c3aed; margin: 0;">${tr.app_title}</h1>
            </div>
            <h2 style="color: #1f2937;">${tr.login_welcome.replace('ديولي', '').replace('Dueli', '')} ${name}!</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                ${tr.auth_register_success.split('!')[0]}:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                    ${tr.account_verification}
                </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
                <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
            </p>
        `;

        return this.send({
            to: email,
            subject: tr.email_activate_subject,
            html: this.buildHtmlWrapper(content, lang)
        });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(
        email: string,
        resetCode: string,
        lang: Language
    ): Promise<any> {
        const tr = translations[getUILanguage(lang)];

        const content = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #7c3aed; margin: 0;">${tr.app_title}</h1>
            </div>
            <h2 style="color: #1f2937;">${tr.reset_password_title}</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                ${tr.verification_code_label}:
            </p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
                ${tr.password_min_length}
            </p>
        `;

        return this.send({
            to: email,
            subject: tr.email_reset_subject,
            html: this.buildHtmlWrapper(content, lang)
        });
    }
}

export default EmailService;
