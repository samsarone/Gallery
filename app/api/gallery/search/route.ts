import { NextRequest, NextResponse } from 'next/server';
import { searchGallery } from '@/lib/samsarGalleryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const formatValue = url.searchParams.get('format');
  const format = ['landscape', 'portrait', 'square'].includes(formatValue ?? '')
    ? (formatValue as 'landscape' | 'portrait' | 'square')
    : undefined;
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 24));

  try {
    return NextResponse.json(await searchGallery({ query, limit, format }));
  } catch (error) {
    console.error('Gallery search failed:', error);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 502 });
  }
}
