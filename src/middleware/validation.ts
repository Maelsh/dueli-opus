import { Context, Next } from 'hono';
import { z, ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../lib/errors/AppError';

/**
 * Validation Middleware Factory
 * معالج التحقق من الصحة
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'param' = 'body') => {
    return async (c: Context, next: Next) => {
        try {
            let data: any;

            switch (source) {
                case 'body':
                    data = await c.req.json();
                    break;
                case 'query':
                    data = c.req.query();
                    break;
                case 'param':
                    data = c.req.param();
                    break;
            }

            const validated = schema.parse(data);
            
            // Store validated data in context
            c.set('validatedData', validated);
            
            await next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                throw new ValidationError('خطأ في البيانات المرسلة', errors);
            }
            throw error;
        }
    };
};

/**
 * Common Validation Schemas
 * مخططات التحقق الشائعة
 */

// Competition Creation Schema
export const competitionCreateSchema = z.object({
    title: z.string().min(10).max(200),
    description: z.string().min(50).max(2000),
    category_id: z.number().int().positive(),
    scheduled_at: z.string().datetime().optional(),
    max_duration: z.number().int().min(900).max(7200).optional(), // 15 min - 2 hours
    rules: z.string().max(1000).optional()
});

// Competition Request Schema
export const competitionRequestSchema = z.object({
    competition_id: z.number().int().positive(),
    message: z.string().max(500).optional()
});

// Invitation Schema
export const invitationSchema = z.object({
    competition_id: z.number().int().positive(),
    invitee_id: z.number().int().positive()
});

// User Update Schema
export const userUpdateSchema = z.object({
    display_name: z.string().min(2).max(100).optional(),
    bio: z.string().max(500).optional(),
    avatar_url: z.string().url().optional(),
    country_code: z.string().length(2).optional(),
    language: z.enum(['ar', 'en']).optional()
});

// Comment Schema
export const commentSchema = z.object({
    competition_id: z.number().int().positive(),
    content: z.string().min(1).max(2000),
    timestamp_seconds: z.number().int().min(0).optional(),
    parent_id: z.number().int().positive().optional()
});

// Message Schema
export const messageSchema = z.object({
    recipient_id: z.number().int().positive(),
    content: z.string().min(1).max(2000)
});

// Rating Schema
export const ratingSchema = z.object({
    competition_id: z.number().int().positive(),
    creator_rating: z.number().int().min(0).max(100),
    opponent_rating: z.number().int().min(0).max(100)
});

// Report Schema
export const reportSchema = z.object({
    report_type: z.enum(['user', 'competition', 'comment', 'content']),
    reported_id: z.number().int().positive().optional(),
    competition_id: z.number().int().positive().optional(),
    comment_id: z.number().int().positive().optional(),
    reason: z.string().min(10).max(500),
    description: z.string().max(2000).optional()
});
