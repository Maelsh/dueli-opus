/**
 * @file src/controllers/DocumentController.ts
 * @description H9 managed documents/data (R2-A): admin CRUD with
 * draft/published + private/public, versioned updates, audited changes;
 * plus one public read for published+public docs (private/draft stay
 * invisible — 404, no existence oracle).
 * @module controllers/DocumentController
 */

import { BaseController, AppContext } from './base/BaseController';
import {
    ManagedDocumentModel,
    ManagedDocument,
    ManagedDocumentStatus,
    ManagedDocumentVisibility,
    MANAGED_DOCUMENT_STATUSES,
    MANAGED_DOCUMENT_VISIBILITIES,
    isValidDocumentSlug,
} from '../models/ManagedDocumentModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';

function safeDoc(row: ManagedDocument | null) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        title_ar: row.title_ar,
        title_en: row.title_en,
        body_ar: row.body_ar,
        body_en: row.body_en,
        status: row.status,
        visibility: row.visibility,
        version: row.version,
        is_seed: row.is_seed,
        created_by: row.created_by,
        updated_by: row.updated_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export class DocumentController extends BaseController {

    private async requireAdmin(c: AppContext): Promise<any | null> {
        const user = this.getCurrentUser(c);
        if (!user || user.is_admin !== 1) return null;
        return user;
    }

    /**
     * Admin: create document (draft by default).
     * POST /api/admin/documents
     */
    async createDocument(c: AppContext) {
        try {
            const admin = await this.requireAdmin(c);
            if (!admin) return this.forbidden(c);
            const body = await this.getBody<{
                slug: string; title_ar: string; title_en: string;
                body_ar?: string; body_en?: string;
                status?: ManagedDocumentStatus; visibility?: ManagedDocumentVisibility;
            }>(c);
            if (!body?.slug || !body?.title_ar || !body?.title_en) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            const slug = body.slug.trim().toLowerCase();
            if (!isValidDocumentSlug(slug)) {
                return this.validationError(c, this.t('documents.slug_invalid', c));
            }
            if (body.status !== undefined && !(MANAGED_DOCUMENT_STATUSES as readonly string[]).includes(body.status)) {
                return this.validationError(c, this.t('documents.status_invalid', c));
            }
            if (body.visibility !== undefined && !(MANAGED_DOCUMENT_VISIBILITIES as readonly string[]).includes(body.visibility)) {
                return this.validationError(c, this.t('documents.visibility_invalid', c));
            }
            const model = new ManagedDocumentModel(c.env.DB);
            if (await model.slugExists(slug)) {
                return this.error(c, this.t('documents.slug_taken', c), 409);
            }
            const doc = await model.create({
                slug,
                title_ar: body.title_ar.trim(),
                title_en: body.title_en.trim(),
                body_ar: body.body_ar ?? '',
                body_en: body.body_en ?? '',
                status: body.status ?? 'draft',
                visibility: body.visibility ?? 'private',
                created_by: admin.id,
                updated_by: admin.id,
            });
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    admin.id, 'document_created', 'managed_document', doc.id, `slug=${slug}`
                );
            } catch (e) { console.error('[DocumentController] audit failed:', e); }
            return this.success(c, { document: safeDoc(doc) }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: list all documents (drafts, private and seed-flagged included).
     * GET /api/admin/documents
     */
    async listDocuments(c: AppContext) {
        try {
            const admin = await this.requireAdmin(c);
            if (!admin) return this.forbidden(c);
            const limit = Math.max(1, Math.min(this.getQueryInt(c, 'limit') || 50, 100));
            const offset = Math.max(0, this.getQueryInt(c, 'offset') || 0);
            const docs = await new ManagedDocumentModel(c.env.DB).listAll(limit, offset);
            return this.success(c, { documents: docs.map(safeDoc) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: get one document by id (any status/visibility).
     * GET /api/admin/documents/:id
     */
    async getDocument(c: AppContext) {
        try {
            const admin = await this.requireAdmin(c);
            if (!admin) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const doc = await new ManagedDocumentModel(c.env.DB).findById(id);
            if (!doc) return this.notFound(c);
            return this.success(c, { document: safeDoc(doc) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: update document (content/status/visibility; version++).
     * PUT /api/admin/documents/:id
     */
    async updateDocument(c: AppContext) {
        try {
            const admin = await this.requireAdmin(c);
            if (!admin) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const model = new ManagedDocumentModel(c.env.DB);
            const existing = await model.findById(id);
            if (!existing) return this.notFound(c);
            const body = await this.getBody<{
                slug?: string; title_ar?: string; title_en?: string;
                body_ar?: string; body_en?: string;
                status?: ManagedDocumentStatus; visibility?: ManagedDocumentVisibility;
            }>(c);
            if (!body || Object.keys(body).length === 0) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (body.slug !== undefined) {
                const slug = body.slug.trim().toLowerCase();
                if (!isValidDocumentSlug(slug)) {
                    return this.validationError(c, this.t('documents.slug_invalid', c));
                }
                if (await model.slugExists(slug, id)) {
                    return this.error(c, this.t('documents.slug_taken', c), 409);
                }
                body.slug = slug;
            }
            if (body.status !== undefined && !(MANAGED_DOCUMENT_STATUSES as readonly string[]).includes(body.status)) {
                return this.validationError(c, this.t('documents.status_invalid', c));
            }
            if (body.visibility !== undefined && !(MANAGED_DOCUMENT_VISIBILITIES as readonly string[]).includes(body.visibility)) {
                return this.validationError(c, this.t('documents.visibility_invalid', c));
            }
            if (body.title_ar !== undefined && !body.title_ar.trim()) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (body.title_en !== undefined && !body.title_en.trim()) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            const wasStatus = existing.status;
            const updated = await model.update(id, { ...body, updated_by: admin.id });
            const action = body.status && body.status !== wasStatus
                ? (body.status === 'published' ? 'document_published' : 'document_unpublished')
                : 'document_updated';
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    admin.id, action, 'managed_document', id,
                    `slug=${updated?.slug} version=${updated?.version}`
                );
            } catch (e) { console.error('[DocumentController] audit failed:', e); }
            return this.success(c, { document: safeDoc(updated) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: delete document.
     * DELETE /api/admin/documents/:id
     */
    async deleteDocument(c: AppContext) {
        try {
            const admin = await this.requireAdmin(c);
            if (!admin) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const model = new ManagedDocumentModel(c.env.DB);
            const existing = await model.findById(id);
            if (!existing) return this.notFound(c);
            const ok = await model.delete(id);
            if (!ok) return this.serverError(c, new Error('Delete failed'));
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    admin.id, 'document_deleted', 'managed_document', id, `slug=${existing.slug}`
                );
            } catch (e) { console.error('[DocumentController] audit failed:', e); }
            return this.success(c, { deleted: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Public: list published+public documents (index metadata only).
     * GET /api/documents — anonymous allowed; drafts/private never appear.
     * R3-C2: powers the public /docs index page.
     */
    async listPublished(c: AppContext) {
        try {
            const model = new ManagedDocumentModel(c.env.DB);
            const docs = await model.listPublishedPublic(50, 0);
            return this.success(c, {
                documents: docs.map((d) => ({
                    id: d.id,
                    slug: d.slug,
                    title_ar: d.title_ar,
                    title_en: d.title_en,
                    updated_at: d.updated_at,
                    version: d.version,
                })),
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Public: read one published+public document by slug.
     * GET /api/documents/:slug — anonymous allowed; anything else is 404.
     */
    async getPublished(c: AppContext) {
        try {
            const slug = (c.req.param('slug') || '').trim().toLowerCase();
            if (!slug) return this.notFound(c);
            const doc = await new ManagedDocumentModel(c.env.DB).findPublishedPublic(slug);
            if (!doc) return this.notFound(c);
            return this.success(c, { document: safeDoc(doc) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default DocumentController;
