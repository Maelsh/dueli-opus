/**
 * Email Service - خدمة البريد الإلكتروني
 * 
 * Handles all email sending functionality using your own iFastNet hosting
 * يتعامل مع جميع وظائف إرسال البريد الإلكتروني باستخدام استضافتك الخاصة
 */

import { translations, getUILanguage, isRTL, Language } from '../../i18n';
import { DEFAULT_PLATFORM_URL } from '../../config/defaults';

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
 * Encapsulates all email operations with your iFastNet SMTP endpoint
 */
export class EmailService {
    private readonly apiKey: string;
    // غيّر هذا الرابط لرابط سكربت PHP على استضافتك
    private readonly apiUrl: string;
    private readonly fromName = 'Dueli';
    // غيّر هذا لإيميلك على الاستضافة
    private readonly fromEmail: string;

    constructor(apiKey: string, apiUrl?: string, fromEmail?: string) {
        this.apiKey = apiKey;
        // رابط API على استضافتك - غيّره حسب الدومين الخاص بك
        this.apiUrl = apiUrl || 'https://your-subdomain.yourdomain.com/send-email.php';
        this.fromEmail = fromEmail || 'noreply@yourdomain.com';
    }

    /**
     * Send email via your iFastNet SMTP API
     */
    private async send(options: EmailOptions): Promise<any> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: options.to,
                subject: options.subject,
                html: options.html,
                fromName: this.fromName,
                fromEmail: this.fromEmail
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Email API Error:', errorText);
            throw new Error(`Failed to send email: ${errorText}`);
        }

        return response.json();
    }

    /**
     * Build complete HTML email template with beautiful design
     */
    private buildEmailTemplate(content: string, lang: Language): string {
        const rtl = isRTL(lang);
        const dir = rtl ? 'rtl' : 'ltr';
        const align = rtl ? 'right' : 'left';
        const logoUrl = `${DEFAULT_PLATFORM_URL}/static/dueli-icon.png`;

        return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dueli</title>
    <!--[if mso]>
    <style type="text/css">
        table, td, div, p { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header with Gradient -->
                    <tr>
                        <td style="background: linear-gradient(199deg, #3b00d3 0%, #000000, #bb8318 100%); padding: 40px 30px; text-align: center;">
                            <!-- Logo Image -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <img src="${logoUrl}" alt="Dueli Logo" width="80" height="80" style="display: block; border: 0; margin-bottom: 15px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);" />
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <!-- Gradient Text Effect for Dueli -->
                                        <h1 style="margin: 0; font-size: 36px; font-weight: 900; letter-spacing: 3px;">
                                            <span style="color: transparent;background: linear-gradient(
90deg, #9810fa 0%, #fe9a00 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">DUELI</span>
                                        </h1>
                                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 14px; letter-spacing: 1px; font-weight: 500;">${rtl ? 'منصة المنافسات والحوارات' : 'Competition & Dialogue Platform'}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: ${align};">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="padding-bottom: 15px;">
                                        <img src="${logoUrl}" alt="Dueli" width="40" height="40" style="display: inline-block; border-radius: 8px;" />
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 0 0 10px 0; color: #9ca3af; font-size: 12px;">
                                ${rtl ? 'هذه الرسالة تم إرسالها تلقائياً من منصة ديولي' : 'This email was sent automatically from Dueli platform'}
                            </p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                © ${new Date().getFullYear()} Dueli. ${rtl ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
                            </p>
                            <div style="margin-top: 20px;">
                                <a href="${DEFAULT_PLATFORM_URL}" style="display: inline-block; padding: 10px 25px; background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: #ffffff; text-decoration: none; border-radius: 25px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);">
                                    ${rtl ? 'زيارة المنصة' : 'Visit Platform'}
                                </a>
                            </div>
                        </td>
                    </tr>
                    
                </table>
                
                <!-- Unsubscribe Text -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 20px;">
                    <tr>
                        <td align="center" style="color: #9ca3af; font-size: 11px;">
                            ${rtl ? 'إذا لم تكن أنت من طلب هذا البريد، يمكنك تجاهله بأمان.' : 'If you did not request this email, you can safely ignore it.'}
                        </td>
                    </tr>
                </table>
                
            </td>
        </tr>
    </table>
</body>
</html>`;
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
        // Production fallback is the official custom domain (never pages.dev);
        // an explicit origin (request host) still wins when provided.
        const baseUrl = origin || DEFAULT_PLATFORM_URL;
        const verifyUrl = `${baseUrl}/verify?token=${token}&lang=${lang}`;
        const tr = translations[getUILanguage(lang)];
        const rtl = isRTL(lang);
        const align = rtl ? 'right' : 'left';

        const content = `
            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                ${rtl ? `مرحباً ${name}! 👋` : `Hello ${name}! 👋`}
            </h2>
            
            <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.8;">
                ${rtl
                ? 'شكراً لانضمامك إلى منصة ديولي! نحن سعداء بوجودك معنا. لتفعيل حسابك والبدء في المشاركة في المنافسات والحوارات، يرجى الضغط على الزر أدناه:'
                : 'Thank you for joining Dueli! We\'re excited to have you. To activate your account and start participating in competitions and dialogues, please click the button below:'
            }
            </p>
            
            <!-- CTA Button -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 35px 0;">
                <tr>
                    <td align="center">
                        <a href="${verifyUrl}" style="display: inline-block; padding: 16px 50px; background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);">
                            ${tr.account_verification || (rtl ? 'تفعيل الحساب' : 'Activate Account')} ✨
                        </a>
                    </td>
                </tr>
            </table>
            
            <!-- Divider -->
            <div style="border-top: 1px solid #e5e7eb; margin: 30px 0;"></div>
            
            <!-- Alternative Link -->
            <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px;">
                ${rtl ? 'أو انسخ هذا الرابط في متصفحك:' : 'Or copy this link to your browser:'}
            </p>
            <p style="margin: 0; padding: 15px; background-color: #f3f4f6; border-radius: 8px; word-break: break-all;">
                <a href="${verifyUrl}" style="color: #7c3aed; font-size: 12px; text-decoration: none;">${verifyUrl}</a>
            </p>
            
            <!-- Warning -->
            <div style="margin-top: 30px; padding: 15px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 13px;">
                    ⚠️ ${rtl
                ? 'هذا الرابط صالح لمدة 24 ساعة فقط. إذا انتهت صلاحيته، يمكنك طلب رابط جديد.'
                : 'This link is valid for 24 hours only. If it expires, you can request a new one.'
            }
                </p>
            </div>
        `;

        return this.send({
            to: email,
            subject: `${rtl ? '✨ تفعيل حسابك في ديولي' : '✨ Activate Your Dueli Account'}`,
            html: this.buildEmailTemplate(content, lang)
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
        const rtl = isRTL(lang);

        const content = `
            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                ${rtl ? '🔐 إعادة تعيين كلمة المرور' : '🔐 Password Reset'}
            </h2>
            
            <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.8;">
                ${rtl
                ? 'لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. استخدم الرمز التالي للمتابعة:'
                : 'We received a request to reset your account password. Use the following code to proceed:'
            }
            </p>
            
            <!-- Code Box -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 35px 0;">
                <tr>
                    <td align="center">
                        <div style="display: inline-block; padding: 25px 50px; background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 16px; border: 2px dashed #d1d5db;">
                            <span style="font-size: 40px; font-weight: 800; color: #7c3aed; letter-spacing: 12px; font-family: 'Courier New', monospace;">${resetCode}</span>
                        </div>
                    </td>
                </tr>
            </table>
            
            <p style="margin: 25px 0; color: #6b7280; font-size: 14px; text-align: center;">
                ${rtl ? 'أدخل هذا الرمز في صفحة إعادة تعيين كلمة المرور' : 'Enter this code on the password reset page'}
            </p>
            
            <!-- Warning -->
            <div style="margin-top: 30px; padding: 15px; background-color: #fee2e2; border-radius: 8px; border-left: 4px solid #ef4444;">
                <p style="margin: 0; color: #991b1b; font-size: 13px;">
                    ⏰ ${rtl
                ? 'هذا الرمز صالح لمدة 15 دقيقة فقط. لا تشاركه مع أي شخص!'
                : 'This code is valid for 15 minutes only. Do not share it with anyone!'
            }
                </p>
            </div>
            
            <!-- Security Notice -->
            <div style="margin-top: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 8px;">
                <p style="margin: 0; color: #6b7280; font-size: 13px;">
                    🛡️ ${rtl
                ? 'إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذا البريد وتأكد من أمان حسابك.'
                : 'If you didn\'t request a password reset, ignore this email and make sure your account is secure.'
            }
                </p>
            </div>
        `;

        return this.send({
            to: email,
            subject: `${rtl ? '🔐 رمز إعادة تعيين كلمة المرور - ديولي' : '🔐 Password Reset Code - Dueli'}`,
            html: this.buildEmailTemplate(content, lang)
        });
    }
}

export default EmailService;
