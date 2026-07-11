import VideoGallery from '@/components/VideoGallery';
import { getVideoPagePath } from '@/lib/site';
import { permanentRedirect } from 'next/navigation';

type HomePageProps = {
  searchParams?: {
    videoId?: string | string[];
  };
};

export default function HomePage({ searchParams }: HomePageProps) {
  const legacyVideoId = Array.isArray(searchParams?.videoId)
    ? searchParams.videoId[0]
    : searchParams?.videoId;

  if (legacyVideoId?.trim()) {
    permanentRedirect(getVideoPagePath(legacyVideoId.trim()));
  }

  return (
    <main className="page-shell">
      <VideoGallery />
    </main>
  );
}
