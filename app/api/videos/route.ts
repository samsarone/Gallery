import { NextRequest, NextResponse } from 'next/server';

const apiServer = process.env.API_SERVER;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  if (!apiServer) {
    return NextResponse.json(
      { error: 'API_SERVER environment variable is not configured.' },
      { status: 500 }
    );
  }

  const apiBase = apiServer.replace(/\/$/, '');
  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(limitParam, MAX_LIMIT))
    : DEFAULT_LIMIT;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const authToken =
    request.cookies.get('authToken')?.value ??
    request.headers.get('authorization')?.split('Bearer ')[1] ??
    undefined;

  const upstreamParams = new URLSearchParams({ limit: `${limit}` });
  if (cursor) {
    upstreamParams.set('cursor', cursor);
  }

  const endpoint = `${apiBase}/publication?${upstreamParams.toString()}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Upstream responded with ${response.status}: ${message || 'Unknown error'}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload)
      ? payload
      : [];
    const nextCursor =
      typeof payload?.nextCursor === 'string'
        ? payload.nextCursor
        : typeof payload?.cursor === 'string'
        ? payload.cursor
        : typeof payload?.next?.cursor === 'string'
        ? payload.next.cursor
        : typeof payload?.pagination?.nextCursor === 'string'
        ? payload.pagination.nextCursor
        : typeof payload?.pagination?.cursor === 'string'
        ? payload.pagination.cursor
        : null;
    const hasMoreValue =
      'hasMore' in (payload ?? {})
        ? (payload as { hasMore?: boolean }).hasMore
        : 'pagination' in (payload ?? {}) &&
          typeof (payload as { pagination?: { hasMore?: boolean } }).pagination?.hasMore ===
            'boolean'
        ? (payload as { pagination?: { hasMore?: boolean } }).pagination?.hasMore
        : null;

    const normalizedItems = items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const idCandidate =
          typeof record.id === 'string' && record.id
            ? record.id
            : typeof record._id === 'string' && record._id
            ? record._id
            : '';
        const videoUrl =
          typeof record.videoUrl === 'string' && record.videoUrl.trim().length > 0
            ? record.videoUrl.trim()
            : '';

        if (!idCandidate || !videoUrl) {
          return null;
        }

        const statsSource = record.stats as Record<string, unknown> | undefined;
        const stats = {
          likes: Number(statsSource?.likes ?? 0) || 0,
          comments: Number(statsSource?.comments ?? 0) || 0,
          shares: Number(statsSource?.shares ?? 0) || 0
        };

        const tagsSource = record.tags;
        const tags =
          Array.isArray(tagsSource)
            ? tagsSource
                .filter((tag) => typeof tag === 'string')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : undefined;

        return {
          ...record,
          id: idCandidate,
          videoUrl,
          title:
            typeof record.title === 'string' && record.title.trim().length > 0
              ? record.title.trim()
              : 'Untitled Video',
          description:
            typeof record.description === 'string' ? record.description.trim() : '',
          originalPrompt:
            typeof record.originalPrompt === 'string' ? record.originalPrompt.trim() : undefined,
          tags,
          stats,
          viewerHasLiked: Boolean(record.viewerHasLiked)
        };
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));

    return NextResponse.json({
      items: normalizedItems,
      nextCursor: typeof nextCursor === 'string' && nextCursor ? nextCursor : null,
      hasMore: typeof hasMoreValue === 'boolean' ? hasMoreValue : Boolean(nextCursor)
    });
  } catch (error) {
    console.error('Failed to load publications:', error);
    return NextResponse.json(
      { error: 'Unable to load publications.' },
      { status: 502 }
    );
  }
}
