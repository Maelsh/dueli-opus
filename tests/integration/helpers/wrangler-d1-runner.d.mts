export type D1ResultRow = Record<string, unknown>;

export interface WranglerD1JsonResult {
    success: boolean;
    results: D1ResultRow[];
    meta?: {
        duration?: number;
    };
}

/**
 * Type declarations for tests/integration/helpers/wrangler-d1-runner.mjs.
 * The runner is intentionally plain JS (child_process/fs/path/url without
 * ambient Node types); these declarations give its consumers precise types.
 */
export declare function applyMigrationsViaWrangler(): string;
export declare function queryD1(command: string): D1ResultRow[];
export declare function listMigrationFileNames(): string[];
