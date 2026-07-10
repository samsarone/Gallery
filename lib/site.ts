export const getSiteUrl = (): string =>
  (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://gallery.samsar.one').replace(/\/+$/, '');

export const getVideoPagePath = (videoId: string): string =>
  `/video/${encodeURIComponent(videoId)}`;

export const getVideoPageUrl = (videoId: string): string =>
  new URL(getVideoPagePath(videoId), getSiteUrl()).toString();
