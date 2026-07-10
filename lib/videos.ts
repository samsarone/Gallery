import type { PublishedVideo, VideoStats } from './types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const numberValue = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const getSessionPosterUrl = (sessionId?: string | null): string | undefined => {
  if (!sessionId) {
    return undefined;
  }

  return `https://api.samsar.one/video/splash/${encodeURIComponent(sessionId)}/splash.png`;
};

export const normalizeVideo = (value: unknown): PublishedVideo | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value.id) ?? stringValue(value._id);
  const videoUrl = stringValue(value.videoUrl) ?? stringValue(value.video_url);
  const sessionId =
    stringValue(value.sessionId) ?? stringValue(value.session_id) ?? null;

  if (!id || !videoUrl) {
    return null;
  }

  const statsSource = isRecord(value.stats) ? value.stats : {};
  const stats: VideoStats = {
    likes: numberValue(statsSource.likes),
    comments: numberValue(statsSource.comments),
    shares: numberValue(statsSource.shares),
    views: numberValue(statsSource.views)
  };

  const tags = Array.isArray(value.tags)
    ? value.tags
        .map(stringValue)
        .filter((tag): tag is string => Boolean(tag))
    : [];

  return {
    id,
    videoUrl,
    posterUrl:
      stringValue(value.posterUrl) ??
      stringValue(value.splashImage) ??
      stringValue(value.splash_image) ??
      stringValue(value.thumbnailUrl) ??
      stringValue(value.thumbnail) ??
      getSessionPosterUrl(sessionId),
    title: stringValue(value.title) ?? 'Untitled video',
    description: stringValue(value.description) ?? '',
    aspectRatio:
      stringValue(value.aspectRatio) ??
      stringValue(value.publishedAspectRatio) ??
      stringValue(value.aspect_ratio),
    originalPrompt:
      stringValue(value.originalPrompt) ?? stringValue(value.original_prompt),
    tags,
    creatorHandle:
      stringValue(value.creatorHandle) ?? stringValue(value.creator_handle),
    createdBy: stringValue(value.createdBy) ?? null,
    sessionId,
    createdAt:
      stringValue(value.createdAt) ?? stringValue(value.created_at) ?? null,
    stats,
    viewerHasLiked: Boolean(value.viewerHasLiked),
    isBotUser: Boolean(value.isBotUser)
  };
};

export const parseVideoCollection = (payload: unknown): {
  items: PublishedVideo[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number | null;
} => {
  const record = isRecord(payload) ? payload : {};
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.results)
    ? record.results
    : [];
  const items = source
    .map(normalizeVideo)
    .filter((video): video is PublishedVideo => Boolean(video));
  const nextCursor = stringValue(record.nextCursor) ?? stringValue(record.cursor) ?? null;
  const hasMore =
    typeof record.hasMore === 'boolean' ? record.hasMore : Boolean(nextCursor);
  const totalCount =
    typeof record.totalCount === 'number' && Number.isFinite(record.totalCount)
      ? record.totalCount
      : null;

  return { items, nextCursor, hasMore, totalCount };
};

export const aspectRatioNumber = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'landscape') return 16 / 9;
  if (normalized === 'portrait' || normalized === 'vertical') return 9 / 16;
  if (normalized === 'square') return 1;

  const match = normalized.match(/(\d*\.?\d+)\s*[:x/×]\s*(\d*\.?\d+)/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? width / height : null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const isPortraitVideo = (video: PublishedVideo): boolean => {
  const ratio = aspectRatioNumber(video.aspectRatio);
  return ratio !== null && ratio < 0.9;
};

export const isLandscapeVideo = (video: PublishedVideo): boolean => {
  const ratio = aspectRatioNumber(video.aspectRatio);
  return ratio !== null && ratio >= 0.9;
};

export const formatCompactNumber = (value: number): string => {
  return new Intl.NumberFormat('en', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
};

export const formatPublishedDate = (value?: string | null): string => {
  if (!value) return 'Recently published';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently published';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  }).format(date);
};
