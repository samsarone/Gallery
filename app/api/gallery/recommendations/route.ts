import { NextRequest, NextResponse } from 'next/server';
import {
  createGalleryViewerId,
  loadGalleryRecommendations,
  resolveAuthenticatedGalleryUser
} from '@/lib/samsarGalleryServer';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { SAMSAR_API_SERVER } from '@/lib/config';
import { aspectRatioNumber, normalizeVideo } from '@/lib/videos';
import type { PublishedVideo } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const publicPublicationItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.results)) return record.results;
  return [];
};

const matchesFormat = (video: PublishedVideo, format?: 'landscape' | 'portrait' | 'square') => {
  if (!format) return true;
  const ratio = aspectRatioNumber(video.aspectRatio);
  if (ratio === null) return format !== 'square';
  if (format === 'portrait') return ratio < 0.9;
  if (format === 'square') return Math.abs(ratio - 1) <= 0.1;
  return ratio >= 0.9;
};

const loadPublicFeedFallback = async ({
  format,
  publicationId,
  excludeIds,
  limit
}: {
  format?: 'landscape' | 'portrait' | 'square';
  publicationId?: string;
  excludeIds: string[];
  limit: number;
}): Promise<PublishedVideo[]> => {
  const response = await fetchPublicRead(`${SAMSAR_API_SERVER}/publication?limit=100`);
  if (!response.ok) {
    throw new Error(`Public publication feed returned ${response.status}.`);
  }

  const excluded = new Set([publicationId, ...excludeIds].filter(Boolean));
  return publicPublicationItems(await response.json())
    .map(normalizeVideo)
    .filter((video): video is PublishedVideo => Boolean(video))
    .filter((video) => !excluded.has(video.id) && matchesFormat(video, format))
    .slice(0, limit);
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const user = await resolveAuthenticatedGalleryUser(request);
  const userId = typeof user?._id === 'string' ? user._id : null;
  const viewerId = userId && process.env.GALLERY_VIEWER_SALT?.trim()
    ? createGalleryViewerId(`user:${userId}`)
    : null;
  const formatValue = url.searchParams.get('format');
  const format = ['landscape', 'portrait', 'square'].includes(formatValue ?? '')
    ? (formatValue as 'landscape' | 'portrait' | 'square')
    : undefined;
  const publicationId = url.searchParams.get('videoId') || undefined;
  const limit = Math.max(1, Math.min(40, Number(url.searchParams.get('limit')) || 16));
  const excludeIds = url.searchParams.getAll('exclude').filter(Boolean).slice(0, 100);

  try {
    return NextResponse.json(
      await loadGalleryRecommendations({
        ...(viewerId ? { viewer_id: viewerId } : {}),
        ...(publicationId ? { publication_id: publicationId } : {}),
        limit,
        format,
        exclude_ids: excludeIds
      })
    );
  } catch (error) {
    try {
      const items = await loadPublicFeedFallback({ format, publicationId, excludeIds, limit });
      console.warn('Gallery recommendations unavailable; using the public feed fallback.', error);
      return NextResponse.json({
        items,
        reason: 'popular_now',
        personalized: false,
        fallback: true
      });
    } catch (fallbackError) {
      console.error('Gallery recommendations failed:', error, fallbackError);
      return NextResponse.json(
        { error: 'Recommendations are temporarily unavailable.' },
        { status: 502 }
      );
    }
  }
}
