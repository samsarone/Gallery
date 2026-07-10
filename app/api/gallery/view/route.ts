import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createGalleryViewerId,
  resolveAuthenticatedGalleryUser,
  sendGalleryView
} from '@/lib/samsarGalleryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VISITOR_COOKIE = 'samsarGalleryVisitor';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid view event.' }, { status: 400 });
  }

  const publicationId =
    typeof body.publicationId === 'string' ? body.publicationId.trim() : '';
  if (!publicationId) {
    return NextResponse.json({ error: 'A publication ID is required.' }, { status: 400 });
  }

  const user = await resolveAuthenticatedGalleryUser(request);
  const userId = typeof user?._id === 'string' ? user._id : null;
  const existingVisitor = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitor = existingVisitor || crypto.randomUUID();
  const viewerId = createGalleryViewerId(userId ? `user:${userId}` : `visitor:${visitor}`);

  try {
    const result = await sendGalleryView({
      publication_id: publicationId,
      viewer_id: viewerId,
      event_type: body.eventType ?? 'view',
      watch_time_ms: body.watchTimeMs ?? 0,
      duration_ms: body.durationMs ?? 0,
      source: body.source ?? 'gallery',
      metadata: body.metadata ?? {}
    });
    const response = NextResponse.json(result, { status: 202 });
    if (!existingVisitor) {
      response.cookies.set(VISITOR_COOKIE, visitor, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
        path: '/'
      });
    }
    return response;
  } catch (error) {
    console.error('Gallery view event failed:', error);
    return NextResponse.json({ error: 'Unable to record view.' }, { status: 502 });
  }
}
