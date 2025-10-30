import { NextRequest, NextResponse } from 'next/server';
import { normalizeComment, parseCommentsPayload } from '@/lib/comments';
import type { VideoStats } from '@/lib/types';

const apiServer = process.env.API_SERVER;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const getAuthToken = (request: NextRequest) =>
  request.cookies.get('authToken')?.value ??
  request.headers.get('authorization')?.split('Bearer ')[1] ??
  undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const sanitized = value.replace(/,/g, '');
    const parsed = Number.parseFloat(sanitized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const STAT_KEY_CANDIDATES: Record<
  keyof VideoStats,
  string[]
> = {
  likes: [
    'likes',
    'likesCount',
    'likes_count',
    'likesTotal',
    'likes_total',
    'metrics.likes',
    'metrics.likesCount',
    'interactions.likes',
    'engagement.likes'
  ],
  comments: [
    'comments',
    'commentsCount',
    'comments_count',
    'commentCount',
    'comment_count',
    'replyCount',
    'reply_count',
    'metrics.comments',
    'metrics.commentsCount',
    'interactions.comments',
    'engagement.comments'
  ],
  shares: [
    'shares',
    'sharesCount',
    'shares_count',
    'shareCount',
    'share_count',
    'metrics.shares',
    'metrics.sharesCount',
    'interactions.shares',
    'engagement.shares'
  ]
};

const extractStatFromContainers = (
  containers: Record<string, unknown>[],
  keyPath: string
): number | undefined => {
  const segments = keyPath.split('.');

  for (const container of containers) {
    let current: unknown = container;
    for (const segment of segments) {
      if (!isRecord(current) || !(segment in current)) {
        current = undefined;
        break;
      }
      current = current[segment];
    }

    const value = coerceNumber(current);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const extractStats = (payload: unknown): Partial<VideoStats> => {
  if (!isRecord(payload)) {
    return {};
  }

  const containers: Record<string, unknown>[] = [payload];
  const nestedKeys = ['stats', 'metrics', 'interactions', 'engagement', 'meta'];

  nestedKeys.forEach((key) => {
    const nested = payload[key];
    if (isRecord(nested)) {
      containers.push(nested);
    }
  });

  const result: Partial<VideoStats> = {};

  (Object.keys(STAT_KEY_CANDIDATES) as (keyof VideoStats)[]).forEach((stat) => {
    for (const candidate of STAT_KEY_CANDIDATES[stat]) {
      const value = extractStatFromContainers(containers, candidate);
      if (value !== undefined) {
        result[stat] = Math.max(0, Math.round(value));
        break;
      }
    }
  });

  return result;
};

export async function GET(
  request: NextRequest,
  context: { params: { videoId: string } }
) {
  if (!apiServer) {
    return NextResponse.json(
      { error: 'API_SERVER environment variable is not configured.' },
      { status: 500 }
    );
  }

  const { videoId } = context.params;
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const limitParsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(limitParsed)
    ? Math.max(1, Math.min(limitParsed, MAX_LIMIT))
    : DEFAULT_LIMIT;

  const query = new URLSearchParams({ limit: `${limit}` });
  if (cursor) {
    query.set('cursor', cursor);
  }

  const apiBase = apiServer.replace(/\/$/, '');
  const endpoint = `${apiBase}/publication/${encodeURIComponent(videoId)}/comments?${query.toString()}`;
  const authToken = getAuthToken(request);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || 'Could not load comments.' },
        { status: response.status }
      );
    }

    const payload = await response.json();

    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
    ) {
      return NextResponse.json(
        { error: (payload as { error?: string }).error ?? 'Could not load comments.' },
        { status: 502 }
      );
    }

    const parsed = parseCommentsPayload(payload);
    if (parsed.items.length === 0) {
      console.warn(`No comments parsed for video ${videoId}.`, {
        payloadSnippet: Array.isArray(payload)
          ? payload.slice(0, 3)
          : payload
      });
    }
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to load comments:', error);
    return NextResponse.json(
      { error: 'Unable to load comments.' },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { videoId: string } }
) {
  if (!apiServer) {
    return NextResponse.json(
      { error: 'API_SERVER environment variable is not configured.' },
      { status: 500 }
    );
  }

  const { videoId } = context.params;
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 });
  }

  const authToken = getAuthToken(request);
  if (!authToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const payload =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const rawText = payload.text;
  const text = typeof rawText === 'string' ? rawText : '';

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Comment text is required.' }, { status: 400 });
  }

  const apiBase = apiServer.replace(/\/$/, '');
  const endpoint = `${apiBase}/publication/${encodeURIComponent(videoId)}/comments`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      cache: 'no-store',
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || 'Could not create comment.' },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const commentSource =
      payload && typeof payload === 'object' && 'comment' in payload
        ? (payload as { comment: unknown }).comment
        : payload;

    const comment = normalizeComment(commentSource);
    if (!comment) {
      return NextResponse.json(
        { error: 'Received an unexpected response while creating the comment.' },
        { status: 502 }
      );
    }

    const stats = extractStats(payload);

    return NextResponse.json(
      {
        comment,
        stats
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create comment:', error);
    return NextResponse.json(
      { error: 'Unable to create comment at this time.' },
      { status: 502 }
    );
  }
}
