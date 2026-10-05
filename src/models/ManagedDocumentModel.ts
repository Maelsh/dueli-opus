import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * R2-A (H9): admin-managed documents/data.
 *
 * Minimal store for the documents/data the admin must enter, edit, upload
 * and save: bilingual title/body, draft/published lifecycle, private/public
 * visibility, and a version counter bumped on every update (audit trail
 * itself lives in admin_audit_logs — no second history table).
 */
export type ManagedDocumentStatus = 'draft' | 'published';
export type ManagedDocumentVisibility = 'private' | 'public';

export interface ManagedDocument {
    id: number;
    slug: string;
    title_ar: string;
    title_en: string;
    body_ar: string;
    body_en: string;
    status: ManagedDocumentStatus;
    visibility: ManagedDocumentVisibility;
    version: number;
    is_seed: number;
    created_by: number | null;
    updated_by: number | null;
    created_at: string;
    updated_at: string;
}

export interface ManagedDocumentInput {
    slug: string;
    title_ar: string;
    title_en: string;
    body_ar?: string;
    body_en?: string;
    status?: ManagedDocumentStatus;
    visibility?: ManagedDocumentVisibility;
}

export const MANAGED_DOCUMENT_STATUSES: readonly ManagedDocumentStatus[] = ['draft', 'published'];
export const MANAGED_DOCUMENT_VISIBILITIES: readonly ManagedDocumentVisibility[] = ['private', 'public'];

/** URL-safe slug: lowercase letters, digits and dashes, 2–80 chars. */
export function isValidDocumentSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(slug) && slug.length >= 2;
}

export class ManagedDocumentModel extends BaseModel<ManagedDocument> {
    protected readonly tableName = 'managed_documents';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<ManagedDocument>): Promise<ManagedDocument> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
                (slug, title_ar, title_en, body_ar, body_en, status, visibility, is_seed, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.slug,
            data.title_ar,
            data.title_en,
            data.body_ar ?? '',
            data.body_en ?? '',
            data.status ?? 'draft',
            data.visibility ?? 'private',
            data.is_seed ? 1 : 0,
            data.created_by ?? null,
            data.updated_by ?? data.created_by ?? null
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create managed document');
    }

    async update(id: number, data: Partial<ManagedDocument>): Promise<ManagedDocument | null> {
        const updates: string[] = [];
        const values: unknown[] = [];
        for (const col of ['slug', 'title_ar', 'title_en', 'body_ar', 'body_en', 'status', 'visibility'] as const) {
            if (data[col] !== undefined) {
                updates.push(`${col} = ?`);
                values.push(data[col]);
            }
        }
        if (data.updated_by !== undefined) {
            updates.push('updated_by = ?');
            values.push(data.updated_by);
        }
        if (updates.length === 0) return this.findById(id);
        // Every content/status change bumps the version (audit by counter).
        updates.push('version = version + 1');
        updates.push(`updated_at = datetime('now')`);
        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();
        return this.findById(id);
    }

    async findBySlug(slug: string): Promise<ManagedDocument | null> {
        return this.findOne('slug', slug);
    }

    async slugExists(slug: string, exceptId?: number): Promise<boolean> {
        const row = exceptId === undefined
            ? await this.db.prepare(
                `SELECT id FROM ${this.tableName} WHERE slug = ?`
            ).bind(slug).first()
            : await this.db.prepare(
                `SELECT id FROM ${this.tableName} WHERE slug = ? AND id != ?`
            ).bind(slug, exceptId).first();
        return !!row;
    }

    /** Admin list: everything, newest first. Seed rows ride along flagged. */
    async listAll(limit: number = 50, offset: number = 0): Promise<ManagedDocument[]> {
        return this.query<ManagedDocument>(
            `SELECT * FROM ${this.tableName} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
            limit, offset
        );
    }

    /**
     * Public read: published + public only. Anything else is invisible
     * (caller maps to 404 — no existence oracle for drafts/private docs).
     */
    async findPublishedPublic(slug: string): Promise<ManagedDocument | null> {
        return this.queryOne<ManagedDocument>(
            `SELECT * FROM ${this.tableName} WHERE slug = ? AND status = 'published' AND visibility = 'public'`,
            slug
        );
    }
}

export default ManagedDocumentModel;
