import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/serverAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const jsonFromUpstream = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const errorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  return fallback;
};

const unauthorizedResponse = (
  result: Extract<Awaited<ReturnType<typeof verifyAdminRequest>>, { ok: false }>
) => NextResponse.json({ error: result.message }, { status: result.status });

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.ok) return unauthorizedResponse(admin);

  const apiServer = process.env.API_SERVER!;
  const sourceUrl = new URL(request.url);
  const params = new URLSearchParams({ limit: sourceUrl.searchParams.get('limit') ?? '100' });
  const cursor = sourceUrl.searchParams.get('cursor');
  if (cursor) params.set('cursor', cursor);

  try {
    const response = await fetch(
      `${apiServer.replace(/\/$/, '')}/publication?${params.toString()}`,
      {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${admin.token}` }
      }
    );
    const payload = await jsonFromUpstream(response);
    if (!response.ok) {
      return NextResponse.json(
        { error: errorMessage(payload, 'Unable to load publications.') },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Unable to reach the publication service.' }, { status: 502 });
  }
}

type PublicationInput = {
  sessionId?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  creatorHandle?: unknown;
  aspectRatio?: unknown;
  splashImage?: unknown;
  originalPrompt?: unknown;
};

const parseInput = async (request: NextRequest): Promise<PublicationInput | null> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as PublicationInput) : null;
  } catch {
    return null;
  }
};

const buildUpstreamBody = (body: PublicationInput, sessionId: string) => ({
  session_id: sessionId,
  ...(typeof body.title === 'string' ? { title: body.title.trim() } : {}),
  ...(typeof body.description === 'string' ? { description: body.description.trim() } : {}),
  ...(Array.isArray(body.tags) ? { tags: body.tags } : {}),
  ...(typeof body.creatorHandle === 'string'
    ? { creator_handle: body.creatorHandle.trim() }
    : {}),
  ...(typeof body.aspectRatio === 'string'
    ? { aspect_ratio: body.aspectRatio.trim() }
    : {}),
  ...(typeof body.splashImage === 'string'
    ? { splash_image: body.splashImage.trim() }
    : {}),
  ...(typeof body.originalPrompt === 'string'
    ? { original_prompt: body.originalPrompt.trim() }
    : {})
});

const mutatePublication = async (
  request: NextRequest,
  method: 'POST' | 'PATCH' | 'DELETE'
) => {
  const admin = await verifyAdminRequest(request);
  if (!admin.ok) return unauthorizedResponse(admin);

  const body = await parseInput(request);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!body || !sessionId) {
    return NextResponse.json({ error: 'A video session ID is required.' }, { status: 400 });
  }

  const apiServer = process.env.API_SERVER!;
  const apiBase = apiServer.replace(/\/$/, '');
  const endpoint =
    method === 'POST'
      ? `${apiBase}/publications/publish`
      : `${apiBase}/publications/session/${encodeURIComponent(sessionId)}`;

  try {
    const response = await fetch(endpoint, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${admin.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildUpstreamBody(body, sessionId))
    });
    const payload = await jsonFromUpstream(response);
    if (!response.ok) {
      return NextResponse.json(
        { error: errorMessage(payload, 'Unable to update this publication.') },
        { status: response.status }
      );
    }
    return NextResponse.json(payload, { status: method === 'POST' ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: 'Unable to reach the publication service.' }, { status: 502 });
  }
};

export const POST = (request: NextRequest) => mutatePublication(request, 'POST');
export const PATCH = (request: NextRequest) => mutatePublication(request, 'PATCH');
export const DELETE = (request: NextRequest) => mutatePublication(request, 'DELETE');
