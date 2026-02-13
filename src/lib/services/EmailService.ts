/**
 * Email Service
 * خدمة البريد الإلكتروني
 * 
 * Uses Resend API for email delivery
 */

export interface EmailTemplate {
    subject: string;
    html: string;
    text?: string;
}

export interface SendEmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    attachments?: Array<{
        filename: string;
        content: string;
    }>;
}

export class EmailService {
    private apiKey: string;
    private fromEmail: string;
    private fromName: string;

    constructor(apiKey: string, fromEmail: string = 'noreply@dueli.app', fromName: string = 'Dueli') {
        this.apiKey = apiKey;
        this.fromEmail = fromEmail;
        this.fromName = fromName;
    }

    /**
     * Send email using Resend API
     */
    async send(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: `${this.fromName} <${this.fromEmail}>`,
                    to: Array.isArray(options.to) ? options.to : [options.to],
                    subject: options.subject,
                    html: options.html,
                    text: options.text,
                    reply_to: options.replyTo,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Resend API error: ${error}`);
            }

            const data = await response.json() as { id: string };
            return { success: true, id: data.id };


        } catch (error) {
            console.error('Email send error:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
    }

    /**
     * Send templated email
     */
    async sendTemplate(
        to: string,
        template: string,
        variables: Record<string, string>,
        locale: 'ar' | 'en' = 'en'
    ): Promise<{ success: boolean; id?: string; error?: string }> {
        const emailTemplate = this.getTemplate(template, variables, locale);
        return this.send({
            to,
            ...emailTemplate,
        });
    }

    /**
     * Get email template
     */
    private getTemplate(name: string, variables: Record<string, string>, locale: 'ar' | 'en'): EmailTemplate {
        const templates: Record<string, Record<'ar' | 'en', (vars: Record<string, string>) => EmailTemplate>> = {
            welcome: {
                en: (vars) => ({
                    subject: `Welcome to Dueli, ${vars.name}!`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #7c3aed;">Welcome to Dueli!</h1>
                            <p>Hi ${vars.name},</p>
                            <p>Thank you for joining Dueli - the platform for meaningful conversations and debates.</p>
                            <p>Get started by:</p>
                            <ul>
                                <li>Exploring live competitions</li>
                                <li>Creating your own debate</li>
                                <li>Connecting with other thinkers</li>
                            </ul>
                            <a href="${vars.loginUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                Start Exploring
                            </a>
                            <p>Best regards,<br>The Dueli Team</p>
                        </div>
                    `,
                }),
                ar: (vars) => ({
                    subject: `مرحباً بك في ديولي، ${vars.name}!`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
                            <h1 style="color: #7c3aed;">مرحباً بك في ديولي!</h1>
                            <p>مرحباً ${vars.name}،</p>
                            <p>شكراً لانضمامك إلى ديولي - منصة الحوارات والمناظرات الهادفة.</p>
                            <p>ابدأ بـ:</p>
                            <ul>
                                <li>استكشاف المنافسات الحية</li>
                                <li>إنشاء مناظرتك الخاصة</li>
                                <li>التواصل مع المفكرين الآخرين</li>
                            </ul>
                            <a href="${vars.loginUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                ابدأ الاستكشاف
                            </a>
                            <p>مع أطيب التحيات،<br>فريق ديولي</p>
                        </div>
                    `,
                }),
            },
            passwordReset: {
                en: (vars) => ({
                    subject: 'Reset your Dueli password',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #7c3aed;">Password Reset</h1>
                            <p>Hi ${vars.name},</p>
                            <p>You requested to reset your password. Click the link below to proceed:</p>
                            <a href="${vars.resetUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                Reset Password
                            </a>
                            <p>This link will expire in 1 hour.</p>
                            <p>If you didn't request this, please ignore this email.</p>
                            <p>Best regards,<br>The Dueli Team</p>
                        </div>
                    `,
                }),
                ar: (vars) => ({
                    subject: 'إعادة تعيين كلمة المرور',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
                            <h1 style="color: #7c3aed;">إعادة تعيين كلمة المرور</h1>
                            <p>مرحباً ${vars.name}،</p>
                            <p>لقد طلبت إعادة تعيين كلمة المرور. اضغط على الرابط أدناه للمتابعة:</p>
                            <a href="${vars.resetUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                إعادة تعيين كلمة المرور
                            </a>
                            <p>سينتهي صلاحية هذا الرابط خلال ساعة واحدة.</p>
                            <p>إذا لم تطلب هذا، يرجى تجاهل هذا البريد.</p>
                            <p>مع أطيب التحيات،<br>فريق ديولي</p>
                        </div>
                    `,
                }),
            },
            competitionReminder: {
                en: (vars) => ({
                    subject: `Reminder: ${vars.competitionTitle} starts soon!`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #7c3aed;">Competition Starting Soon</h1>
                            <p>Hi ${vars.name},</p>
                            <p>This is a reminder that <strong>${vars.competitionTitle}</strong> will start in ${vars.timeRemaining}.</p>
                            <p>Don't miss it!</p>
                            <a href="${vars.competitionUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                Join Now
                            </a>
                            <p>Best regards,<br>The Dueli Team</p>
                        </div>
                    `,
                }),
                ar: (vars) => ({
                    subject: `تذكير: ${vars.competitionTitle} تبدأ قريباً!`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
                            <h1 style="color: #7c3aed;">المنافسة تبدأ قريباً</h1>
                            <p>مرحباً ${vars.name}،</p>
                            <p>هذا تذكير بأن <strong>${vars.competitionTitle}</strong> ستبدأ خلال ${vars.timeRemaining}.</p>
                            <p>لا تفوتها!</p>
                            <a href="${vars.competitionUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                                انضم الآن
                            </a>
                            <p>مع أطيب التحيات،<br>فريق ديولي</p>
                        </div>
                    `,
                }),
            },
            withdrawalApproved: {
                en: (vars) => ({
                    subject: 'Your withdrawal has been approved',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #10b981;">Withdrawal Approved</h1>
                            <p>Hi ${vars.name},</p>
                            <p>Your withdrawal request for <strong>$${vars.amount}</strong> has been approved.</p>
                            <p>Payment method: ${vars.method}</p>
                            <p>The funds will be transferred to your account within 3-5 business days.</p>
                            <p>Best regards,<br>The Dueli Team</p>
                        </div>
                    `,
                }),
                ar: (vars) => ({
                    subject: 'تمت الموافقة على طلب السحب',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
                            <h1 style="color: #10b981;">تمت الموافقة على السحب</h1>
                            <p>مرحباً ${vars.name}،</p>
                            <p>تمت الموافقة على طلب السحب بمبلغ <strong>$${vars.amount}</strong>.</p>
                            <p>طريقة الدفع: ${vars.method}</p>
                            <p>سيتم تحويل الأموال إلى حسابك خلال 3-5 أيام عمل.</p>
                            <p>مع أطيب التحيات،<br>فريق ديولي</p>
                        </div>
                    `,
                }),
            },
        };

        const templateFn = templates[name]?.[locale];
        if (!templateFn) {
            throw new Error(`Template "${name}" not found for locale "${locale}"`);
        }

        return templateFn(variables);
    }

    /**
     * Send bulk emails
     */
    async sendBulk(
        recipients: Array<{ email: string; variables: Record<string, string> }>,
        template: string,
        locale: 'ar' | 'en' = 'en'
    ): Promise<{ success: boolean; sent: number; failed: number; errors?: string[] }> {
        let sent = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const recipient of recipients) {
            const result = await this.sendTemplate(recipient.email, template, recipient.variables, locale);
            if (result.success) {
                sent++;
            } else {
                failed++;
                errors.push(`${recipient.email}: ${result.error}`);
            }
        }

        return {
            success: failed === 0,
            sent,
            failed,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
}

// Factory function for creating email service from environment
export function createEmailService(env: { RESEND_API_KEY?: string; FROM_EMAIL?: string }): EmailService | null {
    if (!env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not configured, email service disabled');
        return null;
    }
    return new EmailService(env.RESEND_API_KEY, env.FROM_EMAIL || 'noreply@dueli.app');
}

export default EmailService;
