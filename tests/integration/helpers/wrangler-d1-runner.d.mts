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
export declare function execD1(command: string): void;
export declare function wipeTestState(): void;
export declare function applyMigrationFiles(fileNames: string[]): void;
export declare function listMigrationFileNames(): string[];

export interface D1WriteMeta {
    changes: number | undefined;
    lastRowId: number | undefined;
}

export declare function runD1Write(command: string): D1WriteMeta;
export declare function getProjectRoot(): string;
export declare function readRepoFile(relPath: string): Promise<string>;
