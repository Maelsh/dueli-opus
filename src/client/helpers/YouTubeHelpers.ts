/**
 * @file src/client/helpers/YouTubeHelpers.ts
 * @description أدوات يوتيوب
 * @module client/helpers/YouTubeHelpers
 */

/**
 * YouTube Helpers Class
 * أدوات يوتيوب
 */
export class YouTubeHelpers {
    /**
     * Extract video ID from YouTube URL
     */
    static extractVideoId(url: string): string | null {
        if (!url) return null;
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    /**
     * Get YouTube embed URL
     */
    static getEmbedUrl(videoIdOrUrl: string, autoplay: boolean = false): string {
        const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
        return `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`;
    }

    /**
     * Get YouTube thumbnail URL
     */
    static getThumbnailUrl(videoIdOrUrl: string, quality: 'default' | 'hqdefault' | 'mqdefault' | 'sddefault' | 'maxresdefault' = 'hqdefault'): string {
        const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
        return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    }
}

export default YouTubeHelpers;
