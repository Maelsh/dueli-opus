-- R2-A (H9): admin-managed documents/data store.
-- Additive, forward-only. No seed rows here: test/seed documents are created
-- explicitly via the dev seed path with is_seed = 1 (never real bank/KYC
-- content). Production rows are created only through the admin API.
CREATE TABLE IF NOT EXISTS managed_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    body_ar TEXT NOT NULL DEFAULT '',
    body_en TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    version INTEGER NOT NULL DEFAULT 1,
    is_seed INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_managed_documents_slug ON managed_documents (slug);
CREATE INDEX IF NOT EXISTS idx_managed_documents_status ON managed_documents (status, visibility);
