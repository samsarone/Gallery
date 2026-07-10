import 'server-only';

import { SAMSAR_API_SERVER } from '@/lib/config';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { normalizeVideo } from '@/lib/videos';
import { getSiteUrl } from '@/lib/site';
import type { PublishedVideo } from '@/lib/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getPublicationValue = (payload: unknown): unknown => {
  if (!isRecord(payload)) {
    return payload;
  }

  return payload.publication ?? payload.video ?? payload.data ?? payload;
};

const resolvePosterUrl = async (video: PublishedVideo): Promise<PublishedVideo> => {
  if (!video.posterUrl || video.posterUrl.startsWith('data:')) {
    return video;
  }

  try {
    const response = await fetch(video.posterUrl, {
      method: 'HEAD',
      cache: 'force-cache'
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.startsWith('image/')) {
      return video;
    }
  } catch {
    // Use the branded fallback when the session frame is no longer available.
  }

  return {
    ...video,
    posterUrl: new URL('/splash.jpg', getSiteUrl()).toString()
  };
};

export const fetchPublicVideo = async (videoId: string): Promise<PublishedVideo | null> => {
  const normalizedId = videoId.trim();
  if (!normalizedId) {
    return null;
  }

  const endpoint = `${SAMSAR_API_SERVER}/publication/${encodeURIComponent(normalizedId)}`;
  const response = await fetchPublicRead(endpoint);

  if (response.status === 404 || response.status === 410) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Publication service responded with ${response.status}.`);
  }

  const payload = await response.json();
  const video = normalizeVideo(getPublicationValue(payload));
  return video ? resolvePosterUrl(video) : null;
};
