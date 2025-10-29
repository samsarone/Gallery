import VideoGallery from '@/components/VideoGallery';

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero hero--compact">
        <p className="hero__subtitle">Public T2V from our creators.</p>
      </header>

      <VideoGallery />
    </main>
  );
}
