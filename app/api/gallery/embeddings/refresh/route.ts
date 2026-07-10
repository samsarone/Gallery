import { NextResponse } from 'next/server';
import { updateGalleryPublicationEmbeddings } from '@/lib/samsarGalleryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    return NextResponse.json(await updateGalleryPublicationEmbeddings());
  } catch (error) {
    console.error('Request-driven gallery embedding refresh failed:', error);
    return NextResponse.json(
      { error: 'Gallery embedding refresh could not be completed.' },
      { status: 502 }
    );
  }
}
