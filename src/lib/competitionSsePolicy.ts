/** Whether the competition SSE channel should stay open (live lifecycle only). */
export function isCompetitionLiveSseAllowed(status: string | null | undefined): boolean {
    if (!status) return true;
    return status !== 'completed' && status !== 'cancelled' && status !== 'archived';
}
