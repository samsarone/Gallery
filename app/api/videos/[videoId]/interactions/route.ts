import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicRead } from '@/lib/publicReadFetch';

const apiServer = process.env.API_SERVER;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  const authToken =
    request.cookies.get('authToken')?.value ??
    request.headers.get('authorization')?.split('Bearer ')[1] ??
    undefined;

  const apiBase = apiServer.replace(/\/$/, '');
  const endpoint = `${apiBase}/publication/${encodeURIComponent(videoId)}/interactions`;

  try {
    const response = await fetchPublicRead(endpoint, authToken);

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || 'Could not load interactions.' },
        { status: response.status }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load interactions:', error);
    return NextResponse.json(
      { error: 'Unable to load interactions.' },
      { status: 502 }
    );
  }
}
