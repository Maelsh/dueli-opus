/**
 * @file src/models/competition-card-columns.ts
 * @description Shared SELECT/ JOIN fragments for the public card projection.
 *
 * Watch Later and Viewing History both render the SAME shared competition card
 * as Home/Search/Profile, so both list queries must project the same public
 * card fields. Keeping the fragment here stops the two lists from drifting.
 *
 * Privacy: only public competition data and the public display identity of the
 * two competitors are selected — never email, password/hash, bio or any other
 * account-private column.
 */

export const COMPETITION_CARD_COLUMNS = `
    c.id,
    c.title,
    c.status,
    c.category_id,
    c.subcategory_id,
    c.creator_id,
    c.opponent_id,
    c.language,
    c.country,
    c.scheduled_at,
    c.started_at,
    c.ended_at,
    c.created_at,
    c.competition_type,
    c.total_views,
    c.likes_count,
    c.dislikes_count,
    c.is_fake,
    c.live_url,
    c.vod_url,
    c.youtube_video_url,
    c.stream_status,
    cat.icon AS category_icon,
    COALESCE(subcat.color, cat.color) AS category_color,
    creator.display_name AS creator_name,
    creator.username AS creator_username,
    creator.avatar_url AS creator_avatar,
    opponent.display_name AS opponent_name,
    opponent.username AS opponent_username,
    opponent.avatar_url AS opponent_avatar
`;

export const COMPETITION_CARD_JOINS = `
    JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
    LEFT JOIN users creator ON c.creator_id = creator.id
    LEFT JOIN users opponent ON c.opponent_id = opponent.id
`;

export interface CollectionCursor {
    at: string;
    id: number;
}

export interface CollectionPage<T> {
    items: T[];
    next: CollectionCursor | null;
}
