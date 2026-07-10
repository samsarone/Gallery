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
type MobilePlaybackMode = 'portrait' | 'landscape';

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

const popularityScore = (video: PublishedVideo) =>
  video.stats.views +
  video.stats.likes * 8 +
  video.stats.comments * 12 +
  video.stats.shares * 16;

const sortByPopularity = (collection: PublishedVideo[]) =>
  [...collection].sort((left, right) => {
    const scoreDifference = popularityScore(right) - popularityScore(left);
    if (scoreDifference !== 0) return scoreDifference;
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });

function PreviewVideo({
  video,
  onMetadata,
  onUnavailable,
  playOnHover = true
}: {
  video: PublishedVideo;
  onMetadata: (video: PublishedVideo, element: HTMLVideoElement) => void;
  onUnavailable: (id: string) => void;
  playOnHover?: boolean;
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
      loop={playOnHover}
      muted
      onLoadedMetadata={(event) => onMetadata(video, event.currentTarget)}
      onError={() => onUnavailable(video.id)}
      onMouseEnter={playOnHover
        ? (event) => void event.currentTarget.play().catch(() => undefined)
        : undefined}
      onMouseLeave={playOnHover ? (event) => event.currentTarget.pause() : undefined}
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

function PortraitFeatureCard({
  video,
  rank,
  onOpen,
  onMetadata,
  onUnavailable
}: {
  video: PublishedVideo;
  rank: number;
  onOpen: (video: PublishedVideo) => void;
  onMetadata: (video: PublishedVideo, element: HTMLVideoElement) => void;
  onUnavailable: (id: string) => void;
}) {
  return (
    <article className="portrait-feature-card">
      <button onClick={() => onOpen(video)} type="button" aria-label={`Play ${video.title}`}>
        <PreviewVideo
          onMetadata={onMetadata}
          onUnavailable={onUnavailable}
          video={video}
        />
        <span className="portrait-feature-card__shade" />
        <span className="portrait-feature-card__rank">{rank}</span>
        <span className="portrait-feature-card__play"><Icon name="play" size={18} /></span>
        <span className="portrait-feature-card__body">
          <strong>{video.title}</strong>
          <small>{mediaCreator(video)} · {formatCompactNumber(video.stats.views)} views</small>
        </span>
      </button>
    </article>
  );
}

function MobileBrowseCard({
  video,
  format,
  onOpen,
  onMetadata,
  onUnavailable
}: {
  video: PublishedVideo;
  format: MobilePlaybackMode;
  onOpen: (video: PublishedVideo) => void;
  onMetadata: (video: PublishedVideo, element: HTMLVideoElement) => void;
  onUnavailable: (id: string) => void;
}) {
  return (
    <article className={`mobile-browse-card mobile-browse-card--${format}`}>
      <button onClick={() => onOpen(video)} type="button" aria-label={`Play ${video.title}`}>
        <PreviewVideo
          onMetadata={onMetadata}
          onUnavailable={onUnavailable}
          playOnHover={false}
          video={video}
        />
        <span className="mobile-browse-card__shade" />
        <span className="mobile-browse-card__play"><Icon name="play" size={17} /></span>
      </button>
      <div>
        <strong>{video.title}</strong>
        <small>{mediaCreator(video)} · {formatCompactNumber(video.stats.views)} views</small>
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

export default function VideoGallery({
  initialQuery = '',
  searchMode = false
}: {
  initialQuery?: string;
  searchMode?: boolean;
}) {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<PublishedVideo | null>(null);
  const [mobilePlaybackMode, setMobilePlaybackMode] = useState<MobilePlaybackMode | null>(null);
  const [activeMobileId, setActiveMobileId] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
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
    setQuery(initialQuery);
    setSearchResults(null);
  }, [initialQuery]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      '(max-width: 767px), (max-width: 960px) and (max-height: 500px) and (orientation: landscape)'
    );
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (mobilePlaybackMode) return;
    const requestedId = new URLSearchParams(window.location.search).get('videoId');
    if (!requestedId || videos.length === 0) return;
    const requested = videos.find((video) => video.id === requestedId);
    if (requested) setSelectedVideo(requested);
  }, [mobilePlaybackMode, videos]);

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
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/gallery/recommendations?limit=40', {
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
  }, []);

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

  const rankedVideos = useMemo(() => {
    if (query.trim()) return searchedVideos;
    const currentById = new Map(videos.map((video) => [video.id, video]));
    const recommendations = homeRecommendations
      .filter((video) => !unavailableVideoIds.has(video.id))
      .map((video) => currentById.get(video.id) ?? video);
    return mergeUniqueVideos(recommendations, sortByPopularity(searchedVideos));
  }, [homeRecommendations, query, searchedVideos, unavailableVideoIds, videos]);
  const portraitVideos = useMemo(
    () => rankedVideos.filter(isPortraitVideo),
    [rankedVideos]
  );
  const landscapeVideos = useMemo(
    () => rankedVideos.filter((video) => !isPortraitVideo(video)),
    [rankedVideos]
  );
  const featuredPortraitVideos = portraitVideos.slice(0, 8);
  const desktopLandscapeVideos = landscapeVideos.length > 0 ? landscapeVideos : rankedVideos;
  const landscapeGridVideos = desktopLandscapeVideos;
  const mobileLeadLandscape = landscapeVideos.slice(0, 2);
  const mobilePortraitGrid = portraitVideos.slice(0, 6);
  const mobileRemainingLandscape = landscapeVideos.slice(2);
  const mobileRemainingPortrait = portraitVideos.slice(6);
  const baseMobileVideos = useMemo(
    () => mobilePlaybackMode === 'portrait'
      ? portraitVideos
      : mobilePlaybackMode === 'landscape'
        ? landscapeVideos
        : [],
    [landscapeVideos, mobilePlaybackMode, portraitVideos]
  );
  const mobileVideos = (mobileQueue.length > 0 ? mobileQueue : baseMobileVideos)
    .filter((video) => !unavailableVideoIds.has(video.id));
  const visibleSelectedRecommendations = selectedRecommendations
    .filter((video) => !unavailableVideoIds.has(video.id));

  useEffect(() => {
    if (!isMobile || !mobilePlaybackMode || baseMobileVideos.length === 0) return;
    setMobileQueue((current) =>
      current.length === 0
        ? baseMobileVideos
        : mergeUniqueVideos(current, baseMobileVideos)
    );
  }, [baseMobileVideos, isMobile, mobilePlaybackMode]);

  useEffect(() => {
    if (!isMobile || !mobilePlaybackMode || !activeMobileId) return;
    const controller = new AbortController();
    const loadNext = async () => {
      try {
        const params = new URLSearchParams({
          videoId: activeMobileId,
          format: mobilePlaybackMode,
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
  }, [activeMobileId, isMobile, mobilePlaybackMode]);

  useEffect(() => {
    if (isMobile && mobilePlaybackMode && !activeMobileId && mobileVideos[0]) {
      setActiveMobileId(mobileVideos[0].id);
    }
  }, [activeMobileId, isMobile, mobilePlaybackMode, mobileVideos]);

  useEffect(() => {
    if (!isMobile || !mobilePlaybackMode) return;

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
  }, [isMobile, mobilePlaybackMode, mobileVideos]);

  useEffect(() => {
    if (!isMobile || !mobilePlaybackMode) return;

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
  }, [activeMobileId, hasMore, isMobile, loadVideos, loadingMore, mobilePlaybackMode, mobileVideos, muted, nextCursor]);

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

  const startMobilePlayback = useCallback((video: PublishedVideo) => {
    const mode: MobilePlaybackMode = isPortraitVideo(video) ? 'portrait' : 'landscape';
    const candidates = mode === 'portrait' ? portraitVideos : landscapeVideos;
    mobileViewStartedRef.current.clear();
    mobileProgressReportedRef.current.clear();
    setMobileQueue(mergeUniqueVideos([video], candidates));
    setActiveMobileId(video.id);
    setMobilePlaybackMode(mode);
    const url = new URL(window.location.href);
    url.searchParams.set('videoId', video.id);
    window.history.replaceState({}, '', url);
  }, [landscapeVideos, portraitVideos]);

  const closeMobilePlayback = useCallback(() => {
    Object.values(mobileVideoRefs.current).forEach((element) => element?.pause());
    setMobilePlaybackMode(null);
    setMobileQueue([]);
    setActiveMobileId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('videoId');
    window.history.replaceState({}, '', url);
  }, []);

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
  const openSearchResult = isMobile ? startMobilePlayback : openVideo;

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
      {searchMode && !mobilePlaybackMode && (
        <div className="search-results-page">
          <header className="search-results-header">
            <span>Semantic search</span>
            <h1>{query.trim() ? `Results for “${query.trim()}”` : 'Search the video library'}</h1>
            <p>Closest matches appear first, followed by relevant recommendations.</p>
          </header>

          {!query.trim() ? (
            <div className="library-state library-state--inline">
              <h2>Enter a title, topic, creator, or description above.</h2>
            </div>
          ) : searchedVideos.length === 0 && !searchLoading ? (
            <div className="library-state library-state--inline">
              <h2>No videos match “{query}”</h2>
              <p>Try another title, topic, creator, or description.</p>
            </div>
          ) : (
            <>
              {searchLoading && <div className="search-results-loading">Refining matches…</div>}

              {(landscapeVideos.length > 0 || portraitVideos.length > 0) && (
                <section className="search-results-section" aria-labelledby="search-results-title">
                  <div className="section-heading">
                    <div>
                      <span>Recommended for your search</span>
                      <h2 id="search-results-title">Top results</h2>
                    </div>
                    <p>{searchedVideos.length} results</p>
                  </div>
                  {landscapeVideos.length > 0 && (
                    <div className="landscape-grid search-landscape-grid">
                      {landscapeVideos.map((video) => (
                        <LandscapeCard
                          key={video.id}
                          liking={likingIds.has(video.id)}
                          onLike={toggleLike}
                          onMetadata={updateInferredAspectRatio}
                          onOpen={openSearchResult}
                          onShare={shareVideo}
                          onUnavailable={markVideoUnavailable}
                          video={video}
                        />
                      ))}
                    </div>
                  )}
                  {portraitVideos.length > 0 && (
                    <div className="search-portrait-grid">
                      {portraitVideos.map((video, index) => (
                        <PortraitFeatureCard
                          key={video.id}
                          onMetadata={updateInferredAspectRatio}
                          onOpen={openSearchResult}
                          onUnavailable={markVideoUnavailable}
                          rank={index + 1}
                          video={video}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {!searchMode && !isMobile && <div className="desktop-library">
        <header className="library-toolbar">
          <div>
            <span>{query ? 'Matching your search' : homeRecommendationReason === 'based_on_watch_history' ? 'Based on your watch history' : 'Most popular now'}</span>
            <h1>{query ? 'Search results' : 'Featured videos'}</h1>
          </div>
        </header>

        {searchedVideos.length === 0 ? (
          <div className="library-state library-state--inline">
            <h2>No videos match “{query}”</h2>
            <p>Try a creator name, title, or another keyword.</p>
            <button onClick={() => setQuery('')} type="button">Clear search</button>
          </div>
        ) : (
          <>
            {featuredPortraitVideos.length > 0 && (
              <section className="featured-portrait-section" aria-labelledby="featured-portrait-title">
                <div className="section-heading">
                  <div>
                    <span>{homeRecommendationReason === 'based_on_watch_history' ? 'Picked for you' : 'Popular now'}</span>
                    <h2 id="featured-portrait-title">Featured videos</h2>
                  </div>
                  <p>{homeRecommendationReason === 'based_on_watch_history' ? 'Ordered for your interests' : 'Ordered by global popularity'}</p>
                </div>
                <div className="featured-portrait-grid">
                  {featuredPortraitVideos.map((video, index) => (
                    <PortraitFeatureCard
                      key={video.id}
                      onMetadata={updateInferredAspectRatio}
                      onOpen={openVideo}
                      onUnavailable={markVideoUnavailable}
                      rank={index + 1}
                      video={video}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="library-section" id="popular" aria-labelledby="popular-landscape-title">
              <div className="section-heading">
                <div>
                  <span>{query ? 'More matches' : 'Watch next'}</span>
                  <h2 id="popular-landscape-title">
                    {query ? 'Video results' : homeRecommendationReason === 'based_on_watch_history' ? 'Recommended videos' : 'Popular videos'}
                  </h2>
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

      {!searchMode && isMobile && !mobilePlaybackMode && (
        <section className="mobile-browse" aria-label="Samsar video library">
          <header className="mobile-browse__header">
            <div>
              <span>{homeRecommendationReason === 'based_on_watch_history' ? 'Picked for you' : 'Popular now'}</span>
              <h1>Discover videos</h1>
            </div>
          </header>

          {rankedVideos.length === 0 ? (
            <div className="library-state library-state--inline">
              <h2>No videos match “{query}”</h2>
              <button onClick={() => setQuery('')} type="button">Clear search</button>
            </div>
          ) : (
            <>
              <div className="mobile-browse__landscape-stack" aria-label="Popular videos">
                {mobileLeadLandscape.map((video) => (
                  <MobileBrowseCard
                    format="landscape"
                    key={video.id}
                    onMetadata={updateInferredAspectRatio}
                    onOpen={startMobilePlayback}
                    onUnavailable={markVideoUnavailable}
                    video={video}
                  />
                ))}
              </div>

              {mobilePortraitGrid.length > 0 && (
                <section className="mobile-browse__section" aria-labelledby="mobile-featured-title">
                  <div className="mobile-browse__section-heading">
                    <h2 id="mobile-featured-title">Featured videos</h2>
                    <span>Tap to watch</span>
                  </div>
                  <div className="mobile-browse__portrait-grid">
                    {mobilePortraitGrid.map((video) => (
                      <MobileBrowseCard
                        format="portrait"
                        key={video.id}
                        onMetadata={updateInferredAspectRatio}
                        onOpen={startMobilePlayback}
                        onUnavailable={markVideoUnavailable}
                        video={video}
                      />
                    ))}
                  </div>
                </section>
              )}

              {mobileRemainingLandscape.length > 0 && (
                <section className="mobile-browse__section" aria-labelledby="mobile-landscape-title">
                  <div className="mobile-browse__section-heading">
                    <h2 id="mobile-landscape-title">More to watch</h2>
                    <span>Recommended for this session</span>
                  </div>
                  <div className="mobile-browse__landscape-stack">
                    {mobileRemainingLandscape.map((video) => (
                      <MobileBrowseCard
                        format="landscape"
                        key={video.id}
                        onMetadata={updateInferredAspectRatio}
                        onOpen={startMobilePlayback}
                        onUnavailable={markVideoUnavailable}
                        video={video}
                      />
                    ))}
                  </div>
                </section>
              )}

              {mobileRemainingPortrait.length > 0 && (
                <section className="mobile-browse__section" aria-label="More videos">
                  <div className="mobile-browse__portrait-grid">
                    {mobileRemainingPortrait.map((video) => (
                      <MobileBrowseCard
                        format="portrait"
                        key={video.id}
                        onMetadata={updateInferredAspectRatio}
                        onOpen={startMobilePlayback}
                        onUnavailable={markVideoUnavailable}
                        video={video}
                      />
                    ))}
                  </div>
                </section>
              )}

              {hasMore && (
                <button
                  className="load-more-button mobile-browse__load-more"
                  disabled={loadingMore}
                  onClick={() => void loadVideos(nextCursor)}
                  type="button"
                >
                  {loadingMore ? 'Loading…' : 'Show more'} <Icon name="arrow" size={17} />
                </button>
              )}
            </>
          )}
        </section>
      )}

      {isMobile && mobilePlaybackMode === 'portrait' && <section className="mobile-shorts mobile-playback" aria-label="Video recommendation feed">
        <button className="mobile-feed__back" onClick={closeMobilePlayback} type="button" aria-label="Back to video library">
          <Icon name="close" size={20} />
        </button>
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

      {isMobile && mobilePlaybackMode === 'landscape' && <section className="mobile-landscape-feed mobile-playback" aria-label="Video recommendation feed">
        <button className="mobile-feed__back" onClick={closeMobilePlayback} type="button" aria-label="Back to video library">
          <Icon name="close" size={20} />
        </button>
        {mobileVideos.map((video, index) => {
          const isActive = activeMobileId === video.id;
          const shouldLoad = mobileActiveIndex < 0
            ? index < 2
            : Math.abs(index - mobileActiveIndex) <= 2;
          return (
            <article
              className="mobile-landscape-player"
              data-video-id={video.id}
              key={video.id}
              ref={(element) => { mobileItemRefs.current[video.id] = element; }}
            >
              <div className="mobile-landscape-player__media">
                <video
                  controls
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
              </div>
              <div className="mobile-landscape-player__details">
                <span>{mediaCreator(video)}</span>
                <h2>{video.title}</h2>
                {video.description && <p>{video.description}</p>}
                <div className="mobile-landscape-player__actions">
                  <button onClick={() => void toggleLike(video.id)} type="button">
                    <Icon name="heart" size={20} /> {formatCompactNumber(video.stats.likes)}
                  </button>
                  <button onClick={() => openVideo(video)} type="button">
                    <Icon name="message" size={20} /> {formatCompactNumber(video.stats.comments)}
                  </button>
                  <button onClick={() => void shareVideo(video)} type="button">
                    <Icon name="share" size={20} /> Share
                  </button>
                </div>
              </div>
            </article>
          );
        })}
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
