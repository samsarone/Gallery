import { NextRequest, NextResponse } from 'next/server';
import {
  createGalleryViewerId,
  loadGalleryRecommendations,
  resolveAuthenticatedGalleryUser
} from '@/lib/samsarGalleryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  try {
    return NextResponse.json(
      await loadGalleryRecommendations({
        ...(viewerId ? { viewer_id: viewerId } : {}),
        ...(url.searchParams.get('videoId')
          ? { publication_id: url.searchParams.get('videoId')! }
          : {}),
        limit: Math.max(1, Math.min(40, Number(url.searchParams.get('limit')) || 16)),
        format,
        exclude_ids: url.searchParams.getAll('exclude').filter(Boolean).slice(0, 100)
      })
    );
  } catch (error) {
    console.error('Gallery recommendations failed:', error);
    return NextResponse.json(
      { error: 'Recommendations are temporarily unavailable.' },
      { status: 502 }
    );
  }
}
