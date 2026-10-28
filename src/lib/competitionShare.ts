/**
 * Owner-approved competition page share helpers (UNIT35.1).
 * Pure string/URL builders — no DOM, no fetch.
 */

export interface CompetitionShareInput {
    id: number | string;
    title?: string | null;
    status?: string | null;
    winner_id?: number | string | null;
    creator_id?: number | string | null;
    opponent_id?: number | string | null;
    creator_name?: string | null;
    opponent_name?: string | null;
    creator_username?: string | null;
    opponent_username?: string | null;
}

export type SharePlatform =
    | 'whatsapp'
    | 'telegram'
    | 'facebook'
    | 'x'
    | 'linkedin'
    | 'email';

export interface CompetitionShareCopy {
    title: string;
    text: string;
    url: string;
}

function pickName(
    fallback: string,
    display?: string | null,
    username?: string | null,
): string {
    const d = String(display ?? '').trim();
    if (d) return d;
    const u = String(username ?? '').trim();
    if (u) return u.startsWith('@') ? u : `@${u}`;
    return fallback;
}

export function buildCompetitionPublicUrl(
    competitionId: number | string,
    lang: string,
    origin = 'https://dueli.app'
): string {
    const base = String(origin || 'https://dueli.app').replace(/\/+$/, '');
    const id = encodeURIComponent(String(competitionId));
    const l = encodeURIComponent(lang === 'ar' ? 'ar' : 'en');
    return `${base}/competition/${id}?lang=${l}`;
}

export function resolveShareWinnerName(
    comp: CompetitionShareInput,
    lang: string
): string | null {
    if (comp.status !== 'completed' || comp.winner_id == null || comp.winner_id === '') {
        return null;
    }
    const winnerId = String(comp.winner_id);
    const creatorId = comp.creator_id != null ? String(comp.creator_id) : '';
    if (winnerId === creatorId) {
        return pickName(
            lang === 'ar' ? 'المنافس الأول' : 'Competitor 1',
            comp.creator_name,
            comp.creator_username,
        );
    }
    return pickName(
        lang === 'ar' ? 'المنافس الثاني' : 'Competitor 2',
        comp.opponent_name,
        comp.opponent_username,
    );
}

export function buildCompetitionShareCopy(
    comp: CompetitionShareInput,
    lang: string,
    origin?: string
): CompetitionShareCopy {
    const url = buildCompetitionPublicUrl(comp.id, lang, origin);
    const titleFallback = lang === 'ar' ? 'منافسة على Dueli' : 'Dueli competition';
    const title = String(comp.title ?? '').trim() || titleFallback;

    const c1 = pickName(
        lang === 'ar' ? 'المنافس الأول' : 'Competitor 1',
        comp.creator_name,
        comp.creator_username,
    );
    const c2 = pickName(
        lang === 'ar' ? 'المنافس الثاني' : 'Competitor 2',
        comp.opponent_name,
        comp.opponent_username,
    );

    const lines: string[] = [];
    if (lang === 'ar') {
        lines.push(`شاهد المنافسة: ${title}`);
        lines.push(`المتنافسان: ${c1} ضد ${c2}`);
    } else {
        lines.push(`Watch the competition: ${title}`);
        lines.push(`Competitors: ${c1} vs ${c2}`);
    }

    const winner = resolveShareWinnerName(comp, lang);
    if (winner) {
        lines.push(lang === 'ar' ? `الفائز: ${winner}` : `Winner: ${winner}`);
    }

    lines.push(lang === 'ar' ? `الرابط: ${url}` : `Link: ${url}`);

    return {
        title,
        text: lines.join('\n'),
        url,
    };
}

export function buildPlatformShareHref(
    platform: SharePlatform,
    copy: CompetitionShareCopy
): string {
    const encodedUrl = encodeURIComponent(copy.url);
    const encodedText = encodeURIComponent(copy.text);
    const encodedTitle = encodeURIComponent(copy.title);
    switch (platform) {
        case 'whatsapp':
            return `https://wa.me/?text=${encodedText}`;
        case 'telegram':
            return `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        case 'x':
            return `https://twitter.com/intent/tweet?text=${encodedText}`;
        case 'linkedin':
            return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        case 'email':
            return `mailto:?subject=${encodedTitle}&body=${encodedText}`;
        default:
            return copy.url;
    }
}
