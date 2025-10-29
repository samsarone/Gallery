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

  const upstreamParams = new URLSearchParams({ limit: `${limit}` });
  if (cursor) {
    upstreamParams.set('cursor', cursor);
  }

  const endpoint = `${apiBase}/publication?${upstreamParams.toString()}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
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

    return NextResponse.json({
      items,
      nextCursor,
      hasMore: hasMoreValue ?? Boolean(nextCursor)
    });
  } catch (error) {
    console.error('Failed to load publications:', error);
    return NextResponse.json(
      { error: 'Unable to load publications.' },
      { status: 502 }
    );
  }
}
