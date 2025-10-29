'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublishedVideo } from '@/lib/types';
import VideoModal from './VideoModal';

type PublishedVideoPayload = Partial<PublishedVideo> & Record<string, unknown>;

const normalizeVideo = (payload: PublishedVideoPayload): PublishedVideo | null => {
  if (!payload) {
    return null;
  }

  const videoUrl = typeof payload.videoUrl === 'string' ? payload.videoUrl : '';
  const title = typeof payload.title === 'string' && payload.title.trim().length > 0
    ? payload.title.trim()
    : 'Untitled Video';
  const description = typeof payload.description === 'string'
    ? payload.description.trim()
    : '';

  const originalPrompt = typeof payload.originalPrompt === 'string'
    ? payload.originalPrompt.trim()
    : '';

  if (!videoUrl) {
    return null;
  }

  return {
    videoUrl,
    title,
    description,
    originalPrompt: originalPrompt || undefined
  };
};

export default function VideoGallery() {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<PublishedVideo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchVideos = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/videos', {
          method: 'GET',
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Failed to load videos (${response.status})`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error('Unexpected response shape from /api/videos');
        }

        const normalized = payload
          .map((item) => normalizeVideo(item))
          .filter((item): item is PublishedVideo => Boolean(item));

        if (isMounted) {
          setVideos(normalized);
        }
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load videos');
          setVideos([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchVideos();

    return () => {
      isMounted = false;
    };
  }, []);

  const carouselContent = useMemo(() => {
    if (isLoading) {
      return (
        <div className="video-card video-card--placeholder">
          <div className="video-card__media skeleton" />
          <div className="video-card__content">
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text skeleton--text-short" />
            <div className="skeleton skeleton--text skeleton--text-faint" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="error-state">
          <p>{error}</p>
          <button className="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      );
    }

    if (videos.length === 0) {
      return (
        <div className="empty-state">
          <p>No published videos yet. Check back soon!</p>
        </div>
      );
    }

    return videos.map((video) => (
      <article
        key={video.videoUrl}
        className="video-card"
        onClick={() => setSelectedVideo(video)}
        tabIndex={0}
        role="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedVideo(video);
          }
        }}
      >
        <div className="video-card__media">
          <video
            src={video.videoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="video-card__video"
          />
          <div className="video-card__glow" />
        </div>
        <div className="video-card__content">
          <h3 title={video.title}>{video.title}</h3>
          <p>{video.description || 'Tap to view the full experience.'}</p>
          {video.originalPrompt && (
            <p className="video-card__prompt" title={video.originalPrompt}>
              {video.originalPrompt}
            </p>
          )}
        </div>
      </article>
    ));
  }, [error, isLoading, videos]);

  return (
    <>
      <section className="carousel">
        <div className="carousel__track">{carouselContent}</div>
      </section>

      {selectedVideo && (
        <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
      )}
    </>
  );
}
