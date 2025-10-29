import VideoGallery from '@/components/VideoGallery';

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <p className="hero__eyebrow">T2V Gallery</p>
        <p className="hero__subtitle hero__cta">
          <a
            className="hero__cta-link"
            href="https://app.samsar.one"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create your own
          </a>
        </p>
        <p className="hero__subtitle">
          Explore the latest Samsar creations. Scroll the fluid masonry wall to uncover looped
          previews, original prompts, and full descriptions inside an immersive player.
        </p>
      </header>

      <VideoGallery />
    </main>
  );
}
