import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicRead } from '@/lib/publicReadFetch';
import { SAMSAR_API_SERVER } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getAuthToken = (request: NextRequest) =>
  request.cookies.get('authToken')?.value ??
  request.headers.get('authorization')?.split('Bearer ')[1] ??
  undefined;

export async function GET(
  request: NextRequest,
  context: { params: { videoId: string } }
) {
  const { videoId } = context.params;
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 });
  }

  const endpoint = `${SAMSAR_API_SERVER}/publication/${encodeURIComponent(videoId)}`;
  const authToken = getAuthToken(request);

  try {
    const response = await fetchPublicRead(endpoint, authToken);

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || 'Could not load video.' },
        { status: response.status }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load publication:', error);
    return NextResponse.json(
      { error: 'Unable to load video.' },
      { status: 502 }
    );
  }
}
