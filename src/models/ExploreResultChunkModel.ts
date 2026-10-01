/**
 * Explore Result Chunk Model
 * نموذج قطع جلسة النتائج
 *
 * R3-B7: the frozen ordered id list of a result session, stored as bounded
 * JSON chunks (never one row per result, never a giant JSON blob in a single
 * row or cursor). Chunk rows are append-write-once at build time and
 * read-only afterwards — page reads only SELECT the chunk indexes covering
 * the requested snapshot window.
 *
 * Standalone data-access class (composite primary key), same rationale as
 * ExploreResultSessionModel/SessionModel re: BaseModel. No `#private` fields.
 */
export class ExploreResultChunkModel {
    protected readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Persist the full frozen id list as chunk_size-bounded rows in ONE
     * atomic batch, so a session never exposes a partial snapshot: the
     * caller flips the session row building → ready only after this resolves.
     */
    async saveAll(sessionId: string, ids: number[], chunkSize: number): Promise<number> {
        const statements: Array<ReturnType<D1Database['prepare']>> = [];
        let index = 0;
        for (let i = 0; i < ids.length; i += chunkSize) {
            const slice = ids.slice(i, i + chunkSize);
            statements.push(
                this.db.prepare(
                    `INSERT INTO explore_result_chunks (session_id, chunk_index, ids_json) VALUES (?, ?, ?)`
                ).bind(sessionId, index, JSON.stringify(slice))
            );
            index += 1;
        }
        if (statements.length > 0) {
            await this.db.batch(statements);
        }
        return index;
    }

    /**
     * Load the ids covering snapshot positions [fromPos, toPos) — only the
     * chunk rows intersecting that window are read.
     */
    async loadRange(sessionId: string, fromPos: number, toPos: number, chunkSize: number): Promise<number[]> {
        const from = Math.max(0, Math.floor(fromPos));
        const to = Math.max(from, Math.floor(toPos));
        if (to <= from) return [];
        const firstChunk = Math.floor(from / chunkSize);
        const lastChunk = Math.floor((to - 1) / chunkSize);
        const rows = await this.db.prepare(
            `SELECT chunk_index, ids_json FROM explore_result_chunks
             WHERE session_id = ? AND chunk_index >= ? AND chunk_index <= ?
             ORDER BY chunk_index ASC`
        ).bind(sessionId, firstChunk, lastChunk).all<{ chunk_index: number; ids_json: string }>();
        const out: number[] = [];
        for (const row of rows.results ?? []) {
            let parsed: unknown = null;
            try {
                parsed = JSON.parse(row.ids_json);
            } catch {
                parsed = null;
            }
            if (!Array.isArray(parsed)) continue;
            const base = row.chunk_index * chunkSize;
            for (let i = 0; i < parsed.length; i++) {
                const pos = base + i;
                if (pos < from || pos >= to) continue;
                const id = parsed[i];
                if (typeof id === 'number' && Number.isInteger(id) && id > 0) out.push(id);
            }
        }
        return out;
    }

    async countChunks(sessionId: string): Promise<number> {
        const row = await this.db.prepare(
            `SELECT COUNT(*) AS n FROM explore_result_chunks WHERE session_id = ?`
        ).bind(sessionId).first<{ n: number }>();
        return row?.n ?? 0;
    }
}

export default ExploreResultChunkModel;
