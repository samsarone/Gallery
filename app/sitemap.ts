import type { MetadataRoute } from 'next';
import { SAMSAR_API_SERVER } from '@/lib/config';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { getSiteUrl, getVideoPageUrl } from '@/lib/site';
import { parseVideoCollection } from '@/lib/videos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: getSiteUrl(),
      changeFrequency: 'daily',
      priority: 1
    }
  ];

  const seenVideoIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetchPublicRead(`${SAMSAR_API_SERVER}/publication?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Publication service responded with ${response.status} while building the sitemap.`);
    }

    const page = parseVideoCollection(await response.json());
    for (const video of page.items) {
      if (seenVideoIds.has(video.id)) continue;
      seenVideoIds.add(video.id);
      const parsedCreatedAt = video.createdAt ? new Date(video.createdAt) : null;
      entries.push({
        url: getVideoPageUrl(video.id),
        lastModified:
          parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
            ? parsedCreatedAt
            : undefined,
        changeFrequency: 'weekly',
        priority: 0.7
      });
    }

    const nextCursor = page.nextCursor;
    if (!page.hasMore || !nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return entries;
}
