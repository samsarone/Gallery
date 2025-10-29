import VideoGallery from '@/components/VideoGallery';

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <p className="hero__eyebrow">Samsar Studio</p>
        <h1 className="hero__title">Published Video Gallery</h1>
        <p className="hero__subtitle">
          Explore the latest published Samsar creations. Tap into the carousel to view rich
          animations, original prompts, and full descriptions in an immersive player.
        </p>
      </header>

      <VideoGallery />
    </main>
  );
}
