import type { MetadataRoute } from 'next';
import { SAMSAR_API_SERVER } from '@/lib/config';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { getSiteUrl, getVideoPagePath } from '@/lib/site';
import { normalizeVideo } from '@/lib/videos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
};

const getNextCursor = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const cursor = payload.nextCursor ?? payload.cursor;
  return typeof cursor === 'string' && cursor ? cursor : null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: getSiteUrl(),
      changeFrequency: 'daily',
      priority: 1
    }
  ];

  try {
    const videos: unknown[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetchPublicRead(`${SAMSAR_API_SERVER}/publication?${params.toString()}`);
      if (!response.ok) break;

      const payload = await response.json();
      videos.push(...getItems(payload));
      const nextCursor = getNextCursor(payload);
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }

    const seen = new Set<string>();
    for (const item of videos) {
      const video = normalizeVideo(item);
      if (!video || seen.has(video.id)) continue;
      seen.add(video.id);
      const parsedCreatedAt = video.createdAt ? new Date(video.createdAt) : null;
      entries.push({
        url: new URL(getVideoPagePath(video.id), getSiteUrl()).toString(),
        lastModified:
          parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
            ? parsedCreatedAt
            : undefined,
        changeFrequency: 'weekly',
        priority: 0.7
      });
    }
  } catch {
    // Keep the home page in the sitemap if the publication service is unavailable.
  }

  return entries;
}
