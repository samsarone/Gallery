import { NextRequest, NextResponse } from 'next/server';
import { SAMSAR_API_SERVER } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: { videoId: string } }
) {
  const { videoId } = context.params;
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 });
  }

  const authToken =
    request.cookies.get('authToken')?.value ??
    request.headers.get('authorization')?.split('Bearer ')[1] ??
    undefined;

  if (!authToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const endpoint = `${SAMSAR_API_SERVER}/publication/${encodeURIComponent(videoId)}/like`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || 'Could not update like.' },
        { status: response.status }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to toggle like:', error);
    return NextResponse.json(
      { error: 'Unable to process like at this time.' },
      { status: 502 }
    );
  }
}
