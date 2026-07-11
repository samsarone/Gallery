export const SITE_LANGUAGE = 'en';
export const SITE_LOCALE = 'en_US';

export const getSiteUrl = (): string =>
  (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://gallery.samsar.one').replace(/\/+$/, '');

export const getVideoPagePath = (videoId: string): `/video/${string}` =>
  `/video/${encodeURIComponent(videoId)}`;

export const getVideoPageUrl = (videoId: string): string =>
  new URL(getVideoPagePath(videoId), getSiteUrl()).toString();

export const getVideoOgImageUrl = (videoId: string): string =>
  new URL(`/og/video/${encodeURIComponent(videoId)}`, getSiteUrl()).toString();

export const getSitemapUrl = (): string =>
  new URL('/sitemap.xml', getSiteUrl()).toString();
