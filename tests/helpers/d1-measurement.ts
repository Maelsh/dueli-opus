/**
 * UNIT34-B — shared D1 measurement helpers (local sqlite shim).
 *
 * Production D1 `rowsRead` / `rowsWritten` analytics are NOT exposed in vitest.
 * `rowsReadApprox` / `rowsWrittenApprox` count rows returned or `meta.changes`
 * from node:sqlite — comparable locally, NOT labeled as Cloudflare rowsRead.
 */
import type { SqliteD1 } from './sqlite-d1';

export class CountingDb {
    reads = 0;
    writes = 0;
    constructor(private readonly inner: SqliteD1) {}
    prepare(sql: string) {
        if (/^\s*(select|with)/i.test(sql)) this.reads += 1;
        else this.writes += 1;
        return this.inner.prepare(sql);
    }
    batch(statements: never[]) {
        return (this.inner as unknown as { batch(s: never[]): Promise<unknown> }).batch(statements);
    }
    exec(sql: string) {
        return this.inner.exec(sql);
    }
    get statements(): number {
        return this.reads + this.writes;
    }
}

/** Statement + approximate row touch counters (sqlite shim only). */
export class InstrumentedDb {
    reads = 0;
    writes = 0;
    rowsReadApprox = 0;
    rowsWrittenApprox = 0;
    constructor(private readonly inner: SqliteD1) {}
    prepare(sql: string) {
        const isRead = /^\s*(select|with)/i.test(sql);
        if (isRead) this.reads += 1;
        else this.writes += 1;
        const stmt = this.inner.prepare(sql);
        const wrap = <T extends { first?: () => Promise<unknown>; all?: () => Promise<{ results: unknown[] }>; run?: () => Promise<{ meta: { changes: number } }> }>(
            bound: T
        ): T => {
            const out = { ...bound } as T;
            if (bound.first) {
                out.first = async () => {
                    const row = await bound.first!();
                    if (row) this.rowsReadApprox += 1;
                    return row;
                };
            }
            if (bound.all) {
                out.all = async () => {
                    const res = await bound.all!();
                    this.rowsReadApprox += res.results.length;
                    return res;
                };
            }
            if (bound.run) {
                out.run = async () => {
                    const res = await bound.run!();
                    this.rowsWrittenApprox += res.meta.changes ?? 0;
                    return res;
                };
            }
            return out;
        };
        return {
            bind: (...params: unknown[]) => wrap(stmt.bind(...params)),
            first: async () => {
                const row = await stmt.first();
                if (row) this.rowsReadApprox += 1;
                return row;
            },
            all: async () => {
                const res = await stmt.all();
                this.rowsReadApprox += res.results.length;
                return res;
            },
            run: async () => {
                const res = await stmt.run();
                this.rowsWrittenApprox += res.meta.changes ?? 0;
                return res;
            },
        };
    }
    batch(statements: never[]) {
        return (this.inner as unknown as { batch(s: never[]): Promise<unknown> }).batch(statements);
    }
    exec(sql: string) {
        return this.inner.exec(sql);
    }
    get statements(): number {
        return this.reads + this.writes;
    }
}

export class FailingDb {
    attempts = 0;
    prepare(_sql: string) {
        this.attempts += 1;
        const boom = (): never => {
            throw new Error('D1_ERROR: database is unavailable (injected outage)');
        };
        return { bind: () => ({ first: boom, all: boom, run: boom }), first: boom, all: boom, run: boom };
    }
    async batch(): Promise<never> {
        this.attempts += 1;
        throw new Error('D1_ERROR: database is unavailable (injected outage)');
    }
}
