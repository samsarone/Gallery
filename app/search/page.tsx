import VideoGallery from '@/components/VideoGallery';

export const dynamic = 'force-dynamic';

export default function SearchPage({
  searchParams
}: {
  searchParams?: { q?: string | string[] };
}) {
  const rawQuery = Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q;
  const query = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 240) : '';

  return (
    <main className="page-shell">
      <VideoGallery initialQuery={query} searchMode />
    </main>
  );
}
