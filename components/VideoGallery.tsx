/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { PublishedVideo } from '@/lib/types';
import {
  formatCompactNumber,
  formatPublishedDate,
  isPortraitVideo,
  parseVideoCollection
} from '@/lib/videos';
import { getExistingAuthToken } from '@/lib/auth';

const PAGE_SIZE = 48;

type IconName =
  | 'arrow'
  | 'close'
  | 'heart'
  | 'message'
  | 'mute'
  | 'pause'
  | 'play'
  | 'search'
  | 'share'
  | 'sound';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
    mute: <><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    play: <path d="m7 4 13 8-13 8Z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4" /><path d="m8.6 13.5 6.8 4" /></>,
    sound: <><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18 6a8.5 8.5 0 0 1 0 12" /></>
  };

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}

const openAuth = () => {
  window.dispatchEvent(
    new CustomEvent('samsar:open-auth', { detail: { view: 'login' } })
  );
};

const getShareUrl = (video: PublishedVideo) => {
  const url = new URL(window.location.href);
  url.searchParams.set('videoId', video.id);
  return url.toString();
};

const mediaCreator = (video: PublishedVideo) =>
  video.creatorHandle ? `@${video.creatorHandle}` : 'Samsar creator';

const mergeUniqueVideos = (...collections: PublishedVideo[][]): PublishedVideo[] => {
  const map = new Map<string, PublishedVideo>();
  collections.flat().forEach((video) => map.set(video.id, video));
  return Array.from(map.values());
};

function PreviewVideo({
  video,
  onMetadata,
  onUnavailable
}: {
  video: PublishedVideo;
  onMetadata: (video: PublishedVideo, element: HTMLVideoElement) => void;
  onUnavailable: (id: string) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '260px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      loop
      muted
      onLoadedMetadata={(event) => onMetadata(video, event.currentTarget)}
      onError={() => onUnavailable(video.id)}
      onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
      onMouseLeave={(event) => event.currentTarget.pause()}
      playsInline
      poster={video.posterUrl}
      preload={shouldLoad ? 'metadata' : 'none'}
      ref={ref}
      src={shouldLoad ? video.videoUrl : undefined}
    />
  );
}

interface VideoActionsProps {
  video: PublishedVideo;
  compact?: boolean;
  liking?: boolean;
  onLike: (id: string) => void;
  onShare: (video: PublishedVideo) => void;
}

function VideoActions({ video, compact, liking, onLike, onShare }: VideoActionsProps) {
  return (
    <div className={`media-actions${compact ? ' media-actions--compact' : ''}`}>
      <button
        aria-label={video.viewerHasLiked ? 'Unlike' : 'Like'}
        className={video.viewerHasLiked ? 'is-active' : ''}
        disabled={liking}
        onClick={(event) => {
          event.stopPropagation();
          onLike(video.id);
        }}
        type="button"
      >
        <Icon name="heart" size={compact ? 17 : 20} />
        <span>{formatCompactNumber(video.stats.likes)}</span>
      </button>
      <span className="media-actions__stat" title="Comments">
        <Icon name="message" size={compact ? 17 : 20} />
        <span>{formatCompactNumber(video.stats.comments)}</span>
      </span>
      <button
        aria-label="Share video"
        onClick={(event) => {
          event.stopPropagation();
          onShare(video);
        }}
        type="button"
      >
        <Icon name="share" size={compact ? 17 : 20} />
        {!compact && <span>Share</span>}
      </button>
    </div>
  );
}

interface LandscapeCardProps extends VideoActionsProps {
  onOpen: (video: PublishedVideo) => void;
  onMetadata: (video: PublishedVideo, element: HTMLVideoElement) => void;
  onUnavailable: (id: string) => void;
}

function LandscapeCard({
  video,
  liking,
  onLike,
  onMetadata,
  onOpen,
  onShare,
  onUnavailable
}: LandscapeCardProps) {
  return (
    <article className="landscape-card">
      <button
        aria-label={`Play ${video.title}`}
        className="landscape-card__media"
        onClick={() => onOpen(video)}
        type="button"
      >
        <PreviewVideo onMetadata={onMetadata} onUnavailable={onUnavailable} video={video} />
        <span className="landscape-card__play"><Icon name="play" size={18} /></span>
      </button>
      <div className="landscape-card__body">
        <button className="landscape-card__title" onClick={() => onOpen(video)} type="button">
          {video.title}
        </button>
        <div className="landscape-card__subline">
          <span>{mediaCreator(video)}</span>
          <span aria-hidden="true">•</span>
          <span>{formatCompactNumber(video.stats.views)} views</span>
          <span aria-hidden="true">•</span>
          <span>{formatPublishedDate(video.createdAt)}</span>
        </div>
        <VideoActions
          compact
          liking={liking}
          onLike={onLike}
          onShare={onShare}
          video={video}
        />
      </div>
    </article>
  );
}

interface VideoDialogProps extends VideoActionsProps {
  open: boolean;
  onClose: () => void;
  onOpen: (video: PublishedVideo) => void;
  onUnavailable: (id: string) => void;
  onViewEvent: (
    video: PublishedVideo,
    eventType: 'view' | 'progress' | 'complete',
    watchTimeMs: number,
    durationMs: number
  ) => void;
  recommendations: PublishedVideo[];
  recommendationsLoading: boolean;
}

function VideoDialog({
  open,
  onClose,
  onOpen,
  onUnavailable,
  onViewEvent,
  video,
  liking,
  onLike,
  onShare,
  recommendations,
  recommendationsLoading
}: VideoDialogProps) {
  const viewStartedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('no-scroll');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('no-scroll');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    viewStartedRef.current = false;
  }, [video.id]);

  if (!open) return null;

  return (
    <div className="watch-dialog" role="dialog" aria-modal="true" aria-label={video.title}>
      <button className="watch-dialog__backdrop" onClick={onClose} type="button" aria-label="Close video" />
      <div className="watch-dialog__panel">
        <button className="watch-dialog__close" onClick={onClose} type="button" aria-label="Close video">
          <Icon name="close" />
        </button>
        <div className="watch-dialog__layout">
          <div className="watch-dialog__main">
            <div className={`watch-dialog__media${isPortraitVideo(video) ? ' watch-dialog__media--portrait' : ''}`}>
              <video
                autoPlay
                controls
                onEnded={(event) => {
                  onViewEvent(
                    video,
                    'complete',
                    event.currentTarget.duration * 1000,
                    event.currentTarget.duration * 1000
                  );
                  if (recommendations[0]) onOpen(recommendations[0]);
                }}
                onError={() => onUnavailable(video.id)}
                onPause={(event) => {
                  if (event.currentTarget.currentTime >= 3 && !event.currentTarget.ended) {
                    onViewEvent(
                      video,
                      'progress',
                      event.currentTarget.currentTime * 1000,
                      event.currentTarget.duration * 1000
                    );
                  }
                }}
                onPlaying={(event) => {
                  if (viewStartedRef.current) return;
                  viewStartedRef.current = true;
                  onViewEvent(
                    video,
                    'view',
                    event.currentTarget.currentTime * 1000,
                    event.currentTarget.duration * 1000
                  );
                }}
                playsInline
                poster={video.posterUrl}
                src={video.videoUrl}
              />
            </div>
            <div className="watch-dialog__details">
              <div>
                <span className="watch-dialog__creator">{mediaCreator(video)}</span>
                <h2>{video.title}</h2>
                <div className="watch-dialog__views">
                  {formatCompactNumber(video.stats.views)} views · {formatPublishedDate(video.createdAt)}
                </div>
                {video.description && <p>{video.description}</p>}
              </div>
              <VideoActions video={video} liking={liking} onLike={onLike} onShare={onShare} />
            </div>
          </div>
          <aside className="watch-dialog__recommendations" aria-label="Recommended videos">
            <div className="watch-dialog__recommendations-heading">
              <span>Up next</span>
              <strong>Recommended</strong>
            </div>
            {recommendations.map((item) => (
              <button key={item.id} onClick={() => onOpen(item)} type="button">
                <span className="watch-dialog__recommendation-media">
                  <video muted playsInline poster={item.posterUrl} preload="none" />
                  <span><Icon name="play" size={14} /></span>
                </span>
                <span className="watch-dialog__recommendation-copy">
                  <strong>{item.title}</strong>
                  <small>{mediaCreator(item)}</small>
                  <small>{formatCompactNumber(item.stats.views)} views</small>
                </span>
              </button>
            ))}
            {recommendationsLoading && (
              <div className="watch-dialog__recommendations-loading">Finding the next stories…</div>
            )}
            {!recommendationsLoading && recommendations.length === 0 && (
              <div className="watch-dialog__recommendations-empty">More recommendations are being prepared.</div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function VideoGallery() {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<PublishedVideo | null>(null);
  const [activeMobileId, setActiveMobileId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublishedVideo[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [homeRecommendations, setHomeRecommendations] = useState<PublishedVideo[]>([]);
  const [homeRecommendationReason, setHomeRecommendationReason] = useState('popular_now');
  const [selectedRecommendations, setSelectedRecommendations] = useState<PublishedVideo[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [mobileQueue, setMobileQueue] = useState<PublishedVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unavailableVideoIds, setUnavailableVideoIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(true);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const mobileItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const mobileVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const mobileViewStartedRef = useRef<Set<string>>(new Set());
  const mobileProgressReportedRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const markVideoUnavailable = useCallback((id: string) => {
    setUnavailableVideoIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setSelectedVideo((current) => (current?.id === id ? null : current));
    setActiveMobileId((current) => (current === id ? null : current));
  }, []);

  const loadVideos = useCallback(async (cursor?: string | null) => {
    const isAdditionalPage = Boolean(cursor);
    isAdditionalPage ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: `${PAGE_SIZE}` });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/videos?${params.toString()}`, {
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : 'Unable to load the gallery.'
        );
      }

      const parsed = parseVideoCollection(payload);
      setVideos((current) => {
        const map = new Map(current.map((video) => [video.id, video]));
        parsed.items.forEach((video) => map.set(video.id, video));
        return Array.from(map.values());
      });
      setNextCursor(parsed.nextCursor);
      setHasMore(parsed.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the gallery.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadVideos]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('videoId');
    if (!requestedId || videos.length === 0) return;
    const requested = videos.find((video) => video.id === requestedId);
    if (requested) setSelectedVideo(requested);
  }, [videos]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ q: normalizedQuery, limit: '36' });
        const response = await fetch(`/api/gallery/search?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Search unavailable');
        setSearchResults(parseVideoCollection(await response.json()).items);
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === 'AbortError')) {
          setSearchResults(null);
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (isMobile) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/gallery/recommendations?limit=8&format=landscape', {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = await response.json();
        setHomeRecommendations(parseVideoCollection(payload).items);
        if (typeof payload?.reason === 'string') setHomeRecommendationReason(payload.reason);
      } catch {
        // The standard gallery remains available while recommendations are warming up.
      }
    };
    void load();
    return () => controller.abort();
  }, [isMobile]);

  useEffect(() => {
    if (!selectedVideo) {
      setSelectedRecommendations([]);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setRecommendationsLoading(true);
      try {
        const params = new URLSearchParams({ videoId: selectedVideo.id, limit: '14' });
        const response = await fetch(`/api/gallery/recommendations?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) return;
        setSelectedRecommendations(parseVideoCollection(await response.json()).items);
      } catch {
        setSelectedRecommendations([]);
      } finally {
        if (!controller.signal.aborted) setRecommendationsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [selectedVideo]);

  const searchedVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const availableVideos = videos.filter((video) => !unavailableVideoIds.has(video.id));
    if (!normalizedQuery) return availableVideos;
    if (searchResults) {
      return searchResults.filter((video) => !unavailableVideoIds.has(video.id));
    }
    return availableVideos.filter((video) =>
      [video.title, video.description, video.creatorHandle, ...(video.tags ?? [])]
        .some(
          (value) =>
            typeof value === 'string' && value.toLowerCase().includes(normalizedQuery)
        )
    );
  }, [query, searchResults, unavailableVideoIds, videos]);

  const portraitVideos = useMemo(
    () => searchedVideos.filter(isPortraitVideo),
    [searchedVideos]
  );
  const landscapeVideos = useMemo(
    () => searchedVideos.filter((video) => !isPortraitVideo(video)),
    [searchedVideos]
  );
  // Legacy publications are often marked 9:16 even when no landscape catalogue exists.
  // Keep the desktop library useful by presenting those videos in the 16:9 card treatment
  // until true landscape publications are available; portrait playback remains uncropped.
  const desktopLandscapeVideos = landscapeVideos.length > 0
    ? landscapeVideos
    : searchedVideos;
  const featuredVideo = desktopLandscapeVideos[0] ?? null;
  const landscapeGridVideos = featuredVideo
    ? desktopLandscapeVideos.filter((video) => video.id !== featuredVideo.id)
    : desktopLandscapeVideos;
  const baseMobileVideos = portraitVideos.length > 0 ? portraitVideos : searchedVideos;
  const mobileVideos = (mobileQueue.length > 0 ? mobileQueue : baseMobileVideos)
    .filter((video) => !unavailableVideoIds.has(video.id));
  const visibleHomeRecommendations = homeRecommendations
    .filter((video) => !unavailableVideoIds.has(video.id));
  const visibleSelectedRecommendations = selectedRecommendations
    .filter((video) => !unavailableVideoIds.has(video.id));

  useEffect(() => {
    if (!isMobile || baseMobileVideos.length === 0) return;
    setMobileQueue((current) =>
      current.length === 0
        ? baseMobileVideos
        : mergeUniqueVideos(current, baseMobileVideos)
    );
  }, [baseMobileVideos, isMobile]);

  useEffect(() => {
    if (!isMobile || !activeMobileId) return;
    const controller = new AbortController();
    const loadNext = async () => {
      try {
        const params = new URLSearchParams({
          videoId: activeMobileId,
          format: 'portrait',
          limit: '12'
        });
        const response = await fetch(`/api/gallery/recommendations?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) return;
        const recommendations = parseVideoCollection(await response.json()).items;
        if (recommendations.length === 0) return;
        setMobileQueue((current) => {
          const activeIndex = current.findIndex((video) => video.id === activeMobileId);
          if (activeIndex < 0) return mergeUniqueVideos(current, recommendations);
          return mergeUniqueVideos(
            current.slice(0, activeIndex + 1),
            recommendations,
            current.slice(activeIndex + 1)
          );
        });
      } catch {
        // Continue through the publication feed when recommendations are unavailable.
      }
    };
    void loadNext();
    return () => controller.abort();
  }, [activeMobileId, isMobile]);

  useEffect(() => {
    if (isMobile && !activeMobileId && mobileVideos[0]) {
      setActiveMobileId(mobileVideos[0].id);
    }
  }, [activeMobileId, isMobile, mobileVideos]);

  useEffect(() => {
    if (!isMobile) return;

    const elements = Object.values(mobileItemRefs.current).filter(
      (item): item is HTMLElement => Boolean(item)
    );
    if (elements.length === 0 || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute('data-video-id');
        if (id) setActiveMobileId(id);
      },
      { threshold: [0.55, 0.75, 0.95] }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [isMobile, mobileVideos]);

  useEffect(() => {
    if (!isMobile) return;

    Object.entries(mobileVideoRefs.current).forEach(([id, element]) => {
      if (!element) return;
      element.muted = muted || id !== activeMobileId;
      if (id === activeMobileId) {
        void element.play().catch(() => undefined);
      } else {
        element.pause();
      }
    });

    const activeIndex = mobileVideos.findIndex((video) => video.id === activeMobileId);
    if (activeIndex >= mobileVideos.length - 3 && hasMore && !loadingMore) {
      void loadVideos(nextCursor);
    }
  }, [activeMobileId, hasMore, isMobile, loadVideos, loadingMore, mobileVideos, muted, nextCursor]);

  const updateInferredAspectRatio = useCallback(
    (video: PublishedVideo, element: HTMLVideoElement) => {
      if (!element.videoWidth || !element.videoHeight) return;
      const aspectRatio = `${element.videoWidth}:${element.videoHeight}`;
      setVideos((current) =>
        current.map((item) =>
          item.id === video.id && item.aspectRatio !== aspectRatio
            ? { ...item, aspectRatio }
            : item
        )
      );
    },
    []
  );

  const sendViewEvent = useCallback(
    (
      video: PublishedVideo,
      eventType: 'view' | 'progress' | 'complete',
      watchTimeMs: number,
      durationMs: number
    ) => {
      void fetch('/api/gallery/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationId: video.id,
          eventType,
          watchTimeMs: Number.isFinite(watchTimeMs) ? Math.round(watchTimeMs) : 0,
          durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : 0,
          source: isMobile ? 'gallery_mobile' : 'gallery_desktop',
          metadata: { format: isPortraitVideo(video) ? 'portrait' : 'landscape' }
        }),
        keepalive: true
      })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          const views = payload?.stats?.views;
          if (typeof views !== 'number') return;
          setVideos((current) =>
            current.map((item) =>
              item.id === video.id
                ? { ...item, stats: { ...item.stats, views } }
                : item
            )
          );
        })
        .catch(() => undefined);
    },
    [isMobile]
  );

  const advanceMobileVideo = useCallback(
    (video: PublishedVideo, element: HTMLVideoElement) => {
      sendViewEvent(video, 'complete', element.duration * 1000, element.duration * 1000);
      const currentIndex = mobileVideos.findIndex((item) => item.id === video.id);
      const next = mobileVideos[currentIndex + 1];
      if (!next) return;
      setActiveMobileId(next.id);
      mobileItemRefs.current[next.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [mobileVideos, sendViewEvent]
  );

  const handleMobilePlaying = useCallback(
    (video: PublishedVideo, element: HTMLVideoElement) => {
      if (mobileViewStartedRef.current.has(video.id)) return;
      mobileViewStartedRef.current.add(video.id);
      sendViewEvent(video, 'view', element.currentTime * 1000, element.duration * 1000);
    },
    [sendViewEvent]
  );

  const handleMobileProgress = useCallback(
    (video: PublishedVideo, element: HTMLVideoElement) => {
      if (
        mobileProgressReportedRef.current.has(video.id) ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0 ||
        element.currentTime / element.duration < 0.5
      ) {
        return;
      }
      mobileProgressReportedRef.current.add(video.id);
      sendViewEvent(video, 'progress', element.currentTime * 1000, element.duration * 1000);
    },
    [sendViewEvent]
  );

  const toggleLike = useCallback(async (id: string) => {
    const token = getExistingAuthToken();
    if (!token) {
      openAuth();
      return;
    }

    setLikingIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(id)}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error('Unable to update like.');

      setVideos((current) =>
        current.map((video) =>
          video.id === id
            ? {
                ...video,
                viewerHasLiked:
                  typeof payload?.liked === 'boolean'
                    ? payload.liked
                    : !video.viewerHasLiked,
                stats: {
                  ...video.stats,
                  likes:
                    typeof payload?.stats?.likes === 'number'
                      ? payload.stats.likes
                      : Math.max(0, video.stats.likes + (video.viewerHasLiked ? -1 : 1))
                }
              }
            : video
        )
      );
    } catch {
      showToast('We could not update that like. Try again.');
    } finally {
      setLikingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [showToast]);

  const shareVideo = useCallback(async (video: PublishedVideo) => {
    const shareData = { title: video.title, url: getShareUrl(video) };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Link copied to clipboard');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      showToast('Unable to share this video.');
    }
  }, [showToast]);

  const openVideo = useCallback((video: PublishedVideo) => {
    setSelectedVideo(video);
    const url = new URL(window.location.href);
    url.searchParams.set('videoId', video.id);
    window.history.replaceState({}, '', url);
  }, []);

  const closeVideo = useCallback(() => {
    setSelectedVideo(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('videoId');
    window.history.replaceState({}, '', url);
  }, []);

  const selectedCurrent = selectedVideo
    ? videos.find((video) => video.id === selectedVideo.id) ?? selectedVideo
    : null;
  const mobileActiveIndex = mobileVideos.findIndex(
    (video) => video.id === activeMobileId
  );

  if (loading && videos.length === 0) {
    return (
      <div className="library-loading" aria-label="Loading video library">
        <div className="library-loading__hero" />
        <div className="library-loading__row">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
      </div>
    );
  }

  if (error && videos.length === 0) {
    return (
      <div className="library-state">
        <span className="library-state__eyebrow">Connection interrupted</span>
        <h1>The gallery could not load.</h1>
        <p>{error}</p>
        <button onClick={() => void loadVideos()} type="button">Try again</button>
      </div>
    );
  }

  return (
    <>
      {!isMobile && <div className="desktop-library">
        <header className="library-intro">
          <div>
            <span className="library-intro__eyebrow">Made with Samsar</span>
            <h1>Stories worth watching.</h1>
            <p>Explore films, ideas, and impossible worlds created by the Samsar community.</p>
          </div>
          <label className="library-search">
            <Icon name="search" size={19} />
            <span className="sr-only">Search the gallery</span>
            <input
              aria-busy={searchLoading}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search videos and creators"
              type="search"
              value={query}
            />
            {searchLoading && <span className="library-search__spinner" aria-hidden="true" />}
          </label>
        </header>

        {searchedVideos.length === 0 ? (
          <div className="library-state library-state--inline">
            <h2>No videos match “{query}”</h2>
            <p>Try a creator name, title, or another keyword.</p>
            <button onClick={() => setQuery('')} type="button">Clear search</button>
          </div>
        ) : (
          <>
            {featuredVideo && (
              <section className="featured-video" aria-labelledby="featured-title">
                <button className="featured-video__media" onClick={() => openVideo(featuredVideo)} type="button">
                  <video
                    autoPlay
                    loop
                    muted
                    onLoadedMetadata={(event) => updateInferredAspectRatio(featuredVideo, event.currentTarget)}
                    onError={() => markVideoUnavailable(featuredVideo.id)}
                    playsInline
                    poster={featuredVideo.posterUrl}
                    preload="auto"
                    src={featuredVideo.videoUrl}
                  />
                  <span className="featured-video__scrim" />
                  <span className="featured-video__label">Featured</span>
                  <span className="featured-video__watch"><Icon name="play" size={17} /> Watch now</span>
                </button>
                <div className="featured-video__content">
                  <span className="featured-video__creator">{mediaCreator(featuredVideo)}</span>
                  <h2 id="featured-title">{featuredVideo.title}</h2>
                  <p>{featuredVideo.description || 'A new story from the Samsar creator community.'}</p>
                  <div className="featured-video__footer">
                    <span>{formatPublishedDate(featuredVideo.createdAt)}</span>
                    <VideoActions
                      compact
                      liking={likingIds.has(featuredVideo.id)}
                      onLike={toggleLike}
                      onShare={shareVideo}
                      video={featuredVideo}
                    />
                  </div>
                </div>
              </section>
            )}

            {!query && visibleHomeRecommendations.length > 0 && (
              <section className="library-section library-section--recommended" aria-labelledby="recommended-title">
                <div className="section-heading">
                  <div>
                    <span>{homeRecommendationReason === 'based_on_watch_history' ? 'Based on your watch history' : 'Selected for you'}</span>
                    <h2 id="recommended-title">
                      {homeRecommendationReason === 'popular_now' ? 'Popular now' : 'Recommended for you'}
                    </h2>
                  </div>
                  <p>Ranked by relevance, quality, and engagement</p>
                </div>
                <div className="landscape-grid landscape-grid--recommended">
                  {visibleHomeRecommendations.map((video) => (
                    <LandscapeCard
                      key={`recommended-${video.id}`}
                      liking={likingIds.has(video.id)}
                      onLike={toggleLike}
                      onMetadata={updateInferredAspectRatio}
                      onOpen={openVideo}
                      onShare={shareVideo}
                      onUnavailable={markVideoUnavailable}
                      video={video}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="library-section shorts-section" id="shorts" aria-labelledby="shorts-title">
              <div className="section-heading">
                <div>
                  <span>Quick watch</span>
                  <h2 id="shorts-title">Shorts</h2>
                </div>
                <p>Vertical stories from the community</p>
              </div>
              {portraitVideos.length > 0 ? (
                <div className="shorts-carousel">
                  {portraitVideos.map((video) => (
                    <article className="short-card" key={video.id}>
                      <button onClick={() => openVideo(video)} type="button" aria-label={`Play ${video.title}`}>
                        <PreviewVideo
                          onMetadata={updateInferredAspectRatio}
                          onUnavailable={markVideoUnavailable}
                          video={video}
                        />
                        <span className="short-card__shade" />
                        <span className="short-card__play"><Icon name="play" size={18} /></span>
                        <span className="short-card__body">
                          <strong>{video.title}</strong>
                          <small>{mediaCreator(video)}</small>
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="shorts-empty">Fresh Shorts are on the way.</div>
              )}
            </section>

            <section className="library-section" aria-labelledby="latest-title">
              <div className="section-heading">
                <div>
                  <span>Keep exploring</span>
                  <h2 id="latest-title">Latest videos</h2>
                </div>
                <p>{desktopLandscapeVideos.length} videos</p>
              </div>
              <div className="landscape-grid">
                {landscapeGridVideos.map((video) => (
                  <LandscapeCard
                    key={video.id}
                    liking={likingIds.has(video.id)}
                    onLike={toggleLike}
                    onMetadata={updateInferredAspectRatio}
                    onOpen={openVideo}
                    onShare={shareVideo}
                    onUnavailable={markVideoUnavailable}
                    video={video}
                  />
                ))}
              </div>
              {hasMore && (
                <button
                  className="load-more-button"
                  disabled={loadingMore}
                  onClick={() => void loadVideos(nextCursor)}
                  type="button"
                >
                  {loadingMore ? 'Loading…' : 'Show more'} <Icon name="arrow" size={17} />
                </button>
              )}
            </section>
          </>
        )}
      </div>}

      {isMobile && <section className="mobile-shorts" aria-label="Samsar Shorts">
        {mobileVideos.map((video, index) => {
          const isActive = activeMobileId === video.id;
          const shouldLoad =
            mobileActiveIndex < 0
              ? index < 2
              : Math.abs(index - mobileActiveIndex) <= 2;
          return (
            <article
              className="mobile-short"
              data-video-id={video.id}
              key={video.id}
              ref={(element) => { mobileItemRefs.current[video.id] = element; }}
            >
              <video
                muted={muted || !isActive}
                onLoadedMetadata={(event) => updateInferredAspectRatio(video, event.currentTarget)}
                onError={() => markVideoUnavailable(video.id)}
                onEnded={(event) => advanceMobileVideo(video, event.currentTarget)}
                onPlaying={(event) => handleMobilePlaying(video, event.currentTarget)}
                onTimeUpdate={(event) => handleMobileProgress(video, event.currentTarget)}
                playsInline
                poster={video.posterUrl}
                preload={isActive ? 'auto' : 'metadata'}
                ref={(element) => { mobileVideoRefs.current[video.id] = element; }}
                src={shouldLoad ? video.videoUrl : undefined}
              />
              <span className="mobile-short__shade" />
              <button
                aria-label={muted ? 'Turn sound on' : 'Mute'}
                className="mobile-short__sound"
                onClick={() => setMuted((current) => !current)}
                type="button"
              >
                <Icon name={muted ? 'mute' : 'sound'} size={19} />
              </button>
              <div className="mobile-short__content">
                <span>{mediaCreator(video)}</span>
                <h2>{video.title}</h2>
                {video.description && <p>{video.description}</p>}
              </div>
              <div className="mobile-short__actions">
                <button
                  aria-label={video.viewerHasLiked ? 'Unlike' : 'Like'}
                  className={video.viewerHasLiked ? 'is-active' : ''}
                  disabled={likingIds.has(video.id)}
                  onClick={() => void toggleLike(video.id)}
                  type="button"
                >
                  <span><Icon name="heart" size={24} /></span>
                  <small>{formatCompactNumber(video.stats.likes)}</small>
                </button>
                <button aria-label="Open video" onClick={() => openVideo(video)} type="button">
                  <span><Icon name="message" size={24} /></span>
                  <small>{formatCompactNumber(video.stats.comments)}</small>
                </button>
                <button aria-label="Share video" onClick={() => void shareVideo(video)} type="button">
                  <span><Icon name="share" size={23} /></span>
                  <small>Share</small>
                </button>
              </div>
            </article>
          );
        })}
        {mobileVideos.length === 0 && (
          <div className="library-state"><h1>No videos yet</h1><p>Check back soon.</p></div>
        )}
      </section>}

      {selectedCurrent && (
        <VideoDialog
          liking={likingIds.has(selectedCurrent.id)}
          onClose={closeVideo}
          onLike={toggleLike}
          onOpen={openVideo}
          onShare={shareVideo}
          onUnavailable={markVideoUnavailable}
          onViewEvent={sendViewEvent}
          open
          recommendations={visibleSelectedRecommendations}
          recommendationsLoading={recommendationsLoading}
          video={selectedCurrent}
        />
      )}
      {toast && <div className="gallery-toast" role="status">{toast}</div>}
    </>
  );
}
