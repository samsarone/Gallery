import { NextRequest, NextResponse } from 'next/server';

const apiServer = process.env.API_SERVER;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const getAuthToken = (request: NextRequest) =>
  request.cookies.get('authToken')?.value ??
  request.headers.get('authorization')?.split('Bearer ')[1] ??
  undefined;

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
    return NextResponse.json(payload);
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
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('Failed to create comment:', error);
    return NextResponse.json(
      { error: 'Unable to create comment at this time.' },
      { status: 502 }
    );
  }
}
