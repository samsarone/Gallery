import { NextRequest, NextResponse } from 'next/server';
import { SAMSAR_API_SERVER } from '@/lib/config';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { loadGalleryTaxonomyPublicationIds } from '@/lib/samsarGalleryServer';
import type { GalleryTaxonomyKind, PublishedVideo } from '@/lib/types';
import { normalizeVideo } from '@/lib/videos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PAGE_SIZE = 48;
const HYDRATION_CONCURRENCY = 8;

const isTaxonomyKind = (value: string): value is GalleryTaxonomyKind =>
  value === 'categories' || value === 'topics';

const unwrapPublication = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  return record.publication ?? record.video ?? record.data ?? payload;
};

const hydratePublication = async (
  id: string,
  authToken?: string
): Promise<PublishedVideo | null> => {
  try {
    const response = await fetchPublicRead(
      `${SAMSAR_API_SERVER}/publication/${encodeURIComponent(id)}`,
      authToken
    );
    if (!response.ok) return null;
    return normalizeVideo(unwrapPublication(await response.json()));
  } catch {
    return null;
  }
};

const hydratePublications = async (ids: string[], authToken?: string) => {
  const items: PublishedVideo[] = [];
  for (let index = 0; index < ids.length; index += HYDRATION_CONCURRENCY) {
    const batch = ids.slice(index, index + HYDRATION_CONCURRENCY);
    const hydrated = await Promise.all(
      batch.map((id) => hydratePublication(id, authToken))
    );
    hydrated.forEach((video) => {
      if (video) items.push(video);
    });
  }
  return items;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { kind: string; name: string } }
) {
  if (!isTaxonomyKind(params.kind)) {
    return NextResponse.json({ error: 'Unknown gallery taxonomy.' }, { status: 404 });
  }

  const name = decodeURIComponent(params.name).trim();
  if (!name) {
    return NextResponse.json({ error: 'A taxonomy name is required.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '48', 10);
  const requestedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, MAX_PAGE_SIZE))
    : MAX_PAGE_SIZE;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
  const authToken =
    request.cookies.get('authToken')?.value ??
    request.headers.get('authorization')?.split('Bearer ')[1] ??
    undefined;

  try {
    const payload = await loadGalleryTaxonomyPublicationIds(params.kind, name, {
      limit,
      offset
    });
    const publicationIds = Array.isArray(payload?.publication_ids)
      ? payload.publication_ids.filter(
          (id): id is string => typeof id === 'string' && Boolean(id.trim())
        )
      : [];
    const items = await hydratePublications(publicationIds, authToken);

    return NextResponse.json({
      kind: params.kind === 'topics' ? 'topic' : 'category',
      name: payload?.name || name,
      publicationIds,
      items,
      total: Math.max(0, Number(payload?.total) || publicationIds.length),
      limit,
      offset,
      hasMore: offset + publicationIds.length < (Number(payload?.total) || 0)
    });
  } catch (error) {
    console.error(`Failed to load gallery ${params.kind} publications:`, error);
    return NextResponse.json(
      { error: `Unable to load publications for this ${params.kind.slice(0, -1)}.` },
      { status: 502 }
    );
  }
}
