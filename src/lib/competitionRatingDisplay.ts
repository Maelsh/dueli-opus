export interface RatingCompetitorRow {
    competitor_id: number;
    average: number | null;
    count: number;
}

export interface RatingSummaryLabels {
    zeroScore: string;
    liveAwaiting: string;
    scoreScaleHint: string;
    uniqueRaters: string;
    drawLabel: string;
    earlyWithdrawalNote: string;
    zeroCompleted: string;
}

export interface RatingSummaryInput {
    status: 'live' | 'completed' | string;
    resultSource?: string | null;
    endedEarly?: number | boolean | null;
    uniqueRaterCount?: number;
    competitors: RatingCompetitorRow[];
    names: Record<number, string>;
    labels: RatingSummaryLabels;
}

export function shouldShowEarlyWithdrawalRatingNote(input: RatingSummaryInput): boolean {
    if (input.status !== 'completed') return false;
    const early = input.resultSource === 'SYSTEM_EARLY_END' || !!input.endedEarly;
    if (!early) return false;
    const raters = typeof input.uniqueRaterCount === 'number' ? input.uniqueRaterCount : 0;
    return raters === 0;
}

export function ratingAverageLabel(
    status: string,
    avgNum: number | null,
    labels: Pick<RatingSummaryLabels, 'zeroScore' | 'liveAwaiting' | 'zeroCompleted'>,
): string {
    if (avgNum !== null && Number.isFinite(avgNum)) return String(avgNum);
    if (status === 'live') return labels.liveAwaiting;
    return labels.zeroCompleted || labels.zeroScore;
}
