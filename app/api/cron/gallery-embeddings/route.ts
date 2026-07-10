import { NextRequest, NextResponse } from 'next/server';
import { syncGalleryEmbeddings } from '@/lib/samsarGalleryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncGalleryEmbeddings(false));
  } catch (error) {
    console.error('Scheduled gallery embedding sync failed:', error);
    return NextResponse.json({ error: 'Gallery embedding sync failed.' }, { status: 502 });
  }
}
