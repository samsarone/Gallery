'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublishedVideo } from '@/lib/types';
import VideoModal from './VideoModal';

type PublishedVideoPayload = Partial<PublishedVideo> & Record<string, unknown>;

const PAGE_SIZE = 24;

const normalizeVideo = (payload: PublishedVideoPayload): PublishedVideo | null => {
  if (!payload) {
    return null;
  }

  const videoUrl = typeof payload.videoUrl === 'string' ? payload.videoUrl : '';
  const title =
    typeof payload.title === 'string' && payload.title.trim().length > 0
      ? payload.title.trim()
      : 'Untitled Video';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  const originalPrompt =
    typeof payload.originalPrompt === 'string' ? payload.originalPrompt.trim() : '';

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

const mergeVideos = (existing: PublishedVideo[], incoming: PublishedVideo[]) => {
  const seen = new Set(existing.map((video) => video.videoUrl));
  const merged = [...existing];

  incoming.forEach((video) => {
    if (!seen.has(video.videoUrl)) {
      seen.add(video.videoUrl);
      merged.push(video);
    }
  });

  return merged;
};

export default function VideoGallery() {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<PublishedVideo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [supportsIntersectionObserver, setSupportsIntersectionObserver] =
    useState<boolean>(true);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef<boolean>(false);
  const pendingCursorRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
      setSupportsIntersectionObserver(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchVideos = useCallback(
    async (cursor?: string | null) => {
      if (!isMountedRef.current) {
        return;
      }

      const loadMore = Boolean(cursor);
      pendingCursorRef.current = cursor ?? null;

      if (loadMore) {
        setIsFetchingMore(true);
        setLoadMoreError(null);
      } else {
        setIsLoading(true);
        setError(null);
        setHasMore(true);
        setNextCursor(null);
      }

      try {
        const params = new URLSearchParams({ limit: `${PAGE_SIZE}` });
        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(`/api/videos?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Failed to load videos (${response.status})`);
        }

        const payload = await response.json();
        const rawItems: PublishedVideoPayload[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        const normalized = rawItems
          .map((item) => normalizeVideo(item))
          .filter((item: PublishedVideo | null): item is PublishedVideo => Boolean(item));

        setVideos((previous) => (loadMore ? mergeVideos(previous, normalized) : normalized));

        const rawNextCursor =
          payload?.nextCursor ??
          payload?.cursor ??
          payload?.next?.cursor ??
          payload?.pagination?.nextCursor ??
          payload?.pagination?.cursor ??
          null;

        const newCursor = rawNextCursor != null ? String(rawNextCursor) : null;
        setNextCursor(newCursor);

        const moreAvailable =
          typeof payload?.hasMore === 'boolean'
            ? payload.hasMore
            : typeof payload?.pagination?.hasMore === 'boolean'
            ? payload.pagination.hasMore
            : Boolean(newCursor) && normalized.length > 0;

        setHasMore(moreAvailable);
        pendingCursorRef.current = null;
      } catch (fetchError) {
        if (!isMountedRef.current) {
          return;
        }

        if (cursor) {
          setLoadMoreError(
            fetchError instanceof Error ? fetchError.message : 'Failed to load more videos'
          );
          setHasMore(false);
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load videos');
          setVideos([]);
          setHasMore(false);
        }
      } finally {
        if (!isMountedRef.current) {
          return;
        }

        if (cursor) {
          setIsFetchingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    if (!supportsIntersectionObserver) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            hasMore &&
            !isLoading &&
            !isFetchingMore &&
            nextCursor
          ) {
            observer.unobserve(entry.target);
            fetchVideos(nextCursor).finally(() => {
              if (isMountedRef.current && sentinel) {
                observer.observe(sentinel);
              }
            });
          }
        });
      },
      {
        root: null,
        rootMargin: '320px 0px',
        threshold: 0
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [fetchVideos, hasMore, isFetchingMore, isLoading, nextCursor, supportsIntersectionObserver]);

  const handleRetryInitial = () => {
    fetchVideos();
  };

  const handleRetryLoadMore = () => {
    const cursor = pendingCursorRef.current ?? nextCursor;
    if (!cursor) {
      return;
    }

    setHasMore(true);
    fetchVideos(cursor);
  };

  const handleManualLoadMore = () => {
    if (isFetchingMore || isLoading) {
      return;
    }

    const cursor = nextCursor;
    if (!cursor) {
      return;
    }

    fetchVideos(cursor);
  };

  const renderVideos = () =>
    videos.map((video) => (
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

  const placeholderItems = Array.from({ length: 8 }, (_, index) => (
    <div className="video-card video-card--placeholder" key={`placeholder-${index}`}>
      <div className="video-card__media skeleton" />
      <div className="video-card__content">
        <div className="skeleton skeleton--text" />
        <div className="skeleton skeleton--text skeleton--text-short" />
        <div className="skeleton skeleton--text skeleton--text-faint" />
      </div>
    </div>
  ));

  return (
    <>
      <section className="gallery">
        {isLoading && (
          <div className="masonry-grid" aria-hidden="true">
            {placeholderItems}
          </div>
        )}

        {!isLoading && error && (
          <div className="error-state">
            <p>{error}</p>
            <button className="button" onClick={handleRetryInitial}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && videos.length === 0 && (
          <div className="empty-state">
            <p>No published videos yet. Check back soon!</p>
          </div>
        )}

        {!isLoading && !error && videos.length > 0 && (
          <div className="masonry-grid">{renderVideos()}</div>
        )}
      </section>

      <div className="gallery__sentinel" ref={sentinelRef} aria-hidden />

      {(isFetchingMore || loadMoreError || (hasMore && !supportsIntersectionObserver)) && (
        <div className="gallery__status">
          {isFetchingMore && <div className="spinner" aria-label="Loading more videos" />}

          {loadMoreError && (
            <div className="gallery__status-message">
              <p>{loadMoreError}</p>
              <button className="button button--secondary" onClick={handleRetryLoadMore}>
                Retry loading more
              </button>
            </div>
          )}

          {!isFetchingMore && !loadMoreError && hasMore && !supportsIntersectionObserver && (
            <button className="button button--secondary" onClick={handleManualLoadMore}>
              Load more videos
            </button>
          )}
        </div>
      )}

      {selectedVideo && (
        <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
      )}
    </>
  );
}
