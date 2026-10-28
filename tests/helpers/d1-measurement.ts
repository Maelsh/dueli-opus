/**
 * UNIT34-B — shared D1 statement counters for reproducible local measurement.
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
