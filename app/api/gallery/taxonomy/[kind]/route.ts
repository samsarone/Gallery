import { NextRequest, NextResponse } from 'next/server';
import { loadGalleryTaxonomy } from '@/lib/samsarGalleryServer';
import type {
  GalleryTaxonomyItem,
  GalleryTaxonomyKind,
  GalleryTaxonomyResponse
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isTaxonomyKind = (value: string): value is GalleryTaxonomyKind =>
  value === 'categories' || value === 'topics';

export async function GET(
  request: NextRequest,
  { params }: { params: { kind: string } }
) {
  if (!isTaxonomyKind(params.kind)) {
    return NextResponse.json({ error: 'Unknown gallery taxonomy.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '500', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 500))
    : 500;

  try {
    const payload = await loadGalleryTaxonomy(params.kind, {
      limit,
      includePublicationIds: true
    });
    const items: GalleryTaxonomyItem[] = (Array.isArray(payload?.items) ? payload.items : [])
      .filter((item) => typeof item?.name === 'string' && item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        publicationCount: Math.max(0, Number(item.publication_count) || 0),
        publicationIds: Array.isArray(item.publication_ids)
          ? item.publication_ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
          : []
      }))
      .sort((left, right) =>
        right.publicationCount - left.publicationCount || left.name.localeCompare(right.name)
      );
    const response: GalleryTaxonomyResponse = {
      kind: params.kind === 'topics' ? 'topic' : 'category',
      items,
      total: Math.max(0, Number(payload?.total) || items.length)
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error(`Failed to load gallery ${params.kind}:`, error);
    return NextResponse.json(
      { error: `Unable to load gallery ${params.kind}.` },
      { status: 502 }
    );
  }
}
