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
let embeddingRefreshRequested = false;

const requestStaleEmbeddingRefresh = () => {
  if (embeddingRefreshRequested) return;
  embeddingRefreshRequested = true;
  void fetch('/api/gallery/embeddings/refresh', {
    method: 'POST',
    cache: 'no-store',
    keepalive: true
  }).catch(() => {
    // Gallery browsing remains available while the processor retries on a later session.
  });
};

type IconName =
  | 'arrow'
  | 'close'
  | 'menu'
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
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
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
  return new URL(`/video/${encodeURIComponent(video.id)}`, window.location.origin).toString();
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

const GENERIC_CATEGORY_TAGS = new Set(['ai', 'samsar', 'video', 'videos']);

const normalizeCategoryKey = (tag: string) => tag.trim().toLowerCase();

const formatCategoryName = (tag: string) =>
  tag
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    )
    .join(' ');

type GalleryCategory = {
  key: string;
  name: string;
  count: number;
};

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
    <article className="landscape-card" data-video-id={video.id}>
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
    <article className="portrait-feature-card" data-video-id={video.id}>
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
  recommendationsError: boolean;
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
  recommendationsError,
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
              <strong>More to watch</strong>
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
            {!recommendationsLoading && recommendationsError && (
              <div className="watch-dialog__recommendations-empty">Recommendations are temporarily unavailable.</div>
            )}
            {!recommendationsLoading && !recommendationsError && recommendations.length === 0 && (
              <div className="watch-dialog__recommendations-empty">No related videos yet.</div>
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [homeRecommendations, setHomeRecommendations] = useState<PublishedVideo[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<PublishedVideo[]>([]);
  const [recommendationsError, setRecommendationsError] = useState(false);
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
      if (!isAdditionalPage) requestStaleEmbeddingRefresh();
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
    const syncCategoryFromUrl = () => {
      const category = new URLSearchParams(window.location.search).get('category');
      setSelectedCategory(category?.trim().toLowerCase() || null);
    };

    syncCategoryFromUrl();
    window.addEventListener('popstate', syncCategoryFromUrl);
    return () => window.removeEventListener('popstate', syncCategoryFromUrl);
  }, []);

  useEffect(() => {
    if (!mobileCategoryOpen) return;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [mobileCategoryOpen]);

  useEffect(() => {
    if (!mobileCategoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileCategoryOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileCategoryOpen]);

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
      setRecommendationsError(false);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setRecommendationsLoading(true);
      setSelectedRecommendations([]);
      setRecommendationsError(false);
      try {
        const params = new URLSearchParams({ videoId: selectedVideo.id, limit: '14' });
        const response = await fetch(`/api/gallery/recommendations?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Recommendations unavailable');
        setSelectedRecommendations(parseVideoCollection(await response.json()).items);
      } catch {
        if (!controller.signal.aborted) {
          setSelectedRecommendations([]);
          setRecommendationsError(true);
        }
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
  const categoryItems = useMemo<GalleryCategory[]>(() => {
    const counts = new Map<string, number>();

    videos
      .filter((video) => !unavailableVideoIds.has(video.id))
      .forEach((video) => {
        const tags = new Set(
          (video.tags ?? [])
            .map(normalizeCategoryKey)
            .filter(
              (tag) =>
                tag.length > 1 &&
                tag.length <= 48 &&
                !GENERIC_CATEGORY_TAGS.has(tag)
            )
        );

        tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
      });

    return Array.from(counts.entries())
      .sort(([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey)
      )
      .slice(0, 10)
      .map(([key, count]) => ({ key, name: formatCategoryName(key), count }));
  }, [unavailableVideoIds, videos]);
  const selectedCategoryItem = useMemo(
    () => categoryItems.find((category) => category.key === selectedCategory) ?? null,
    [categoryItems, selectedCategory]
  );
  const categoryResults = useMemo(() => {
    if (!selectedCategoryItem) return [];
    return sortByPopularity(
      searchedVideos.filter((video) =>
        (video.tags ?? []).some(
          (tag) => normalizeCategoryKey(tag) === selectedCategoryItem.key
        )
      )
    );
  }, [searchedVideos, selectedCategoryItem]);
  const categoryLandscapeResults = useMemo(
    () => categoryResults.filter((video) => !isPortraitVideo(video)),
    [categoryResults]
  );
  const categoryPortraitResults = useMemo(
    () => categoryResults.filter(isPortraitVideo),
    [categoryResults]
  );
  const portraitVideos = useMemo(
    () => rankedVideos.filter(isPortraitVideo),
    [rankedVideos]
  );
  const landscapeVideos = useMemo(
    () => rankedVideos.filter((video) => !isPortraitVideo(video)),
    [rankedVideos]
  );
  const desktopHomeSections = useMemo(() => {
    const desktopLandscapeVideos = rankedVideos.filter((video) => !isPortraitVideo(video));
    const desktopPortraitVideos = rankedVideos.filter(isPortraitVideo);
    const featured = desktopLandscapeVideos.slice(0, 3);
    const featuredIds = new Set(featured.map((video) => video.id));
    const popularLandscape = desktopLandscapeVideos
      .filter((video) => !featuredIds.has(video.id))
      .slice(0, 6);
    const popularPortrait = desktopPortraitVideos.slice(0, 10);
    const claimedIds = new Set(
      [...featured, ...popularLandscape, ...popularPortrait].map((video) => video.id)
    );
    const categories = new Map<
      string,
      { name: string; videos: PublishedVideo[]; firstRank: number }
    >();

    rankedVideos.forEach((video, rank) => {
      if (claimedIds.has(video.id)) return;
      const videoTags = Array.from(
        new Set(
          (video.tags ?? [])
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 1 && tag.length <= 48)
            .map((tag) => tag.toLowerCase())
        )
      ).slice(0, 8);

      videoTags.forEach((tag) => {
        const existing = categories.get(tag);
        if (existing) {
          existing.videos.push(video);
          return;
        }
        categories.set(tag, {
          name: formatCategoryName(tag),
          videos: [video],
          firstRank: rank
        });
      });
    });

    const sorted = Array.from(categories.entries())
      .map(([key, category]) => ({ key, ...category }))
      .sort(
        (left, right) =>
          right.videos.length - left.videos.length || left.firstRank - right.firstRank
      );
    const preferred = sorted.filter(
      (category) =>
        category.videos.length >= 3 && !GENERIC_CATEGORY_TAGS.has(category.key)
    );
    const supporting = sorted.filter(
      (category) =>
        category.videos.length >= 2 &&
        !GENERIC_CATEGORY_TAGS.has(category.key) &&
        !preferred.some((preferredCategory) => preferredCategory.key === category.key)
    );
    const selected = preferred.length >= 3
      ? preferred
      : [...preferred, ...supporting];
    const categorySections: Array<
      (typeof sorted)[number] & {
        landscape: PublishedVideo[];
        portrait: PublishedVideo[];
      }
    > = [];

    for (const category of selected.length > 0 ? selected : sorted) {
      const available = category.videos.filter((video) => !claimedIds.has(video.id));
      const categoryLandscape = available
        .filter((video) => !isPortraitVideo(video))
        .slice(0, 3);
      const categoryPortrait = available.filter(isPortraitVideo).slice(0, 5);
      const assigned = [...categoryLandscape, ...categoryPortrait];
      if (assigned.length < 2) continue;

      assigned.forEach((video) => claimedIds.add(video.id));
      categorySections.push({
        ...category,
        videos: assigned,
        landscape: categoryLandscape,
        portrait: categoryPortrait
      });
      if (categorySections.length === 6) break;
    }

    return {
      featured,
      popularLandscape,
      popularPortrait,
      categorySections
    };
  }, [rankedVideos]);
  const featuredLandscapeVideos = desktopHomeSections.featured;
  const popularLandscapeVideos = desktopHomeSections.popularLandscape;
  const popularPortraitVideos = desktopHomeSections.popularPortrait;
  const categorySections = desktopHomeSections.categorySections;
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
  const fallbackSelectedRecommendations = useMemo(
    () =>
      sortByPopularity(
        videos.filter(
          (video) =>
            video.id !== selectedVideo?.id && !unavailableVideoIds.has(video.id)
        )
      ).slice(0, 14),
    [selectedVideo, unavailableVideoIds, videos]
  );
  const visibleSelectedRecommendations = selectedRecommendations.length > 0
    ? selectedRecommendations.filter((video) => !unavailableVideoIds.has(video.id))
    : recommendationsError
      ? mergeUniqueVideos(
          homeRecommendations.filter(
            (video) =>
              video.id !== selectedVideo?.id && !unavailableVideoIds.has(video.id)
          ),
          fallbackSelectedRecommendations
        ).slice(0, 14)
      : [];

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
    const categoryCandidates = selectedCategoryItem
      ? categoryResults.filter((candidate) => isPortraitVideo(candidate) === (mode === 'portrait'))
      : null;
    const candidates = categoryCandidates ?? (mode === 'portrait' ? portraitVideos : landscapeVideos);
    mobileViewStartedRef.current.clear();
    mobileProgressReportedRef.current.clear();
    setMobileQueue(mergeUniqueVideos([video], candidates));
    setActiveMobileId(video.id);
    setMobilePlaybackMode(mode);
    const url = new URL(window.location.href);
    url.searchParams.set('videoId', video.id);
    window.history.replaceState({}, '', url);
  }, [categoryResults, landscapeVideos, portraitVideos, selectedCategoryItem]);

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

  const selectCategory = useCallback((category: string | null) => {
    setSelectedCategory(category);
    setMobileCategoryOpen(false);
    setSelectedVideo(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('videoId');
    if (category) {
      url.searchParams.set('category', category);
    } else {
      url.searchParams.delete('category');
    }
    window.history.pushState({}, '', url);
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
          {query.trim() ? (
            <header className="search-results-header">
              <h1>Results for “{query.trim()}”</h1>
            </header>
          ) : (
            <h1 className="sr-only">Search videos</h1>
          )}

          {!query.trim() ? (
            <div className="library-state library-state--inline">
              <h2>Enter a title, topic, creator, or description above.</h2>
            </div>
          ) : searchedVideos.length === 0 && !searchLoading ? (
            <div className="library-state library-state--inline">
              <h2>No videos match “{query}”</h2>
              <p>Try a different search.</p>
            </div>
          ) : (
            <>
              {searchLoading && <div className="search-results-loading">Searching…</div>}

              {(landscapeVideos.length > 0 || portraitVideos.length > 0) && (
                <section className="search-results-section" aria-label="Search results">
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
        <div className="desktop-library-layout">
          <aside className="desktop-category-nav" aria-label="Browse video categories">
            <div className="desktop-category-nav__intro">
              <span>Browse</span>
              <p>Explore the library</p>
            </div>
            <button
              className={`desktop-category-nav__item${selectedCategoryItem ? '' : ' is-active'}`}
              onClick={() => selectCategory(null)}
              type="button"
            >
              <span>All videos</span>
              <small>{formatCompactNumber(videos.length)}</small>
            </button>
            <div className="desktop-category-nav__label">Popular categories</div>
            <div className="desktop-category-nav__list">
              {categoryItems.map((category) => (
                <button
                  className={`desktop-category-nav__item${selectedCategoryItem?.key === category.key ? ' is-active' : ''}`}
                  key={category.key}
                  onClick={() => selectCategory(category.key)}
                  type="button"
                >
                  <span>{category.name}</span>
                  <small>{formatCompactNumber(category.count)}</small>
                </button>
              ))}
            </div>
            {categoryItems.length === 0 && (
              <p className="desktop-category-nav__empty">Categories will appear as videos are published.</p>
            )}
            <p className="desktop-category-nav__note">Sorted by the number of videos in each tag.</p>
          </aside>

          <div className="desktop-library__main">
            {selectedCategoryItem ? (
              <section className="category-results" aria-labelledby="category-results-title">
                <header className="category-results__header">
                  <div>
                    <span className="category-results__eyebrow">Category</span>
                    <h1 id="category-results-title">{selectedCategoryItem.name}</h1>
                    <p>{formatCompactNumber(selectedCategoryItem.count)} videos in this collection</p>
                  </div>
                  <button className="category-results__back" onClick={() => selectCategory(null)} type="button">
                    All videos <Icon name="arrow" size={16} />
                  </button>
                </header>

                {categoryResults.length === 0 ? (
                  <div className="library-state library-state--inline">
                    <h2>No videos in this category yet.</h2>
                    <p>Try another popular category.</p>
                  </div>
                ) : (
                  <>
                    {categoryLandscapeResults.length > 0 && (
                      <section className="category-results__group" aria-labelledby="category-landscape-title">
                        <div className="section-heading">
                          <h2 id="category-landscape-title">Landscape</h2>
                          <span>{formatCompactNumber(categoryLandscapeResults.length)} videos</span>
                        </div>
                        <div className="landscape-grid category-results__landscape-grid">
                          {categoryLandscapeResults.map((video) => (
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
                      </section>
                    )}

                    {categoryPortraitResults.length > 0 && (
                      <section className="category-results__group" aria-labelledby="category-portrait-title">
                        <div className="section-heading">
                          <h2 id="category-portrait-title">Portrait</h2>
                          <span>{formatCompactNumber(categoryPortraitResults.length)} videos</span>
                        </div>
                        <div className="featured-portrait-grid category-results__portrait-grid">
                          {categoryPortraitResults.map((video, index) => (
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

                    {hasMore && (
                      <button
                        className="load-more-button category-results__load-more"
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
            ) : searchedVideos.length === 0 ? (
              <div className="library-state library-state--inline">
                <h2>No videos match “{query}”</h2>
                <p>Try a creator name, title, or another keyword.</p>
                <button onClick={() => setQuery('')} type="button">Clear search</button>
              </div>
            ) : (
              <>
            {featuredLandscapeVideos.length > 0 && (
              <section className="featured-section" aria-label="Featured videos">
                <div className="landscape-grid featured-landscape-grid">
                  {featuredLandscapeVideos.map((video) => (
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
              </section>
            )}

            {(popularLandscapeVideos.length > 0 || popularPortraitVideos.length > 0 || hasMore) && (
              <section className="library-section" id="popular" aria-labelledby="popular-landscape-title">
                <div className="section-heading">
                  <h2 id="popular-landscape-title">Popular</h2>
                </div>
                {popularLandscapeVideos.length > 0 && (
                  <div className="landscape-grid">
                    {popularLandscapeVideos.map((video) => (
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
                )}
                {popularPortraitVideos.length > 0 && (
                  <div className="featured-portrait-grid aspect-row--spaced">
                    {popularPortraitVideos.map((video, index) => (
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
                )}
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
            )}

            {categorySections.map((category, categoryIndex) => (
              <section
                className="library-section category-section"
                aria-labelledby={`category-title-${categoryIndex}`}
                key={category.key}
              >
                <div className="section-heading">
                  <h2 id={`category-title-${categoryIndex}`}>{category.name}</h2>
                </div>
                {category.landscape.length > 0 && (
                  <div className="landscape-grid category-landscape-grid">
                    {category.landscape.map((video) => (
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
                )}
                {category.portrait.length > 0 && (
                  <div className="featured-portrait-grid category-portrait-grid aspect-row--spaced">
                    {category.portrait.map((video, index) => (
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
                )}
              </section>
            ))}
          </>
        )}
          </div>
        </div>
      </div>}

      {!searchMode && isMobile && !mobilePlaybackMode && (
        <>
          <div className="mobile-category-bar">
            <button
              aria-expanded={mobileCategoryOpen}
              aria-label="Open video categories"
              className="mobile-category-bar__trigger"
              onClick={() => setMobileCategoryOpen(true)}
              type="button"
            >
              <Icon name="menu" size={18} />
              <span>Categories</span>
            </button>
            <div className="mobile-category-bar__breadcrumb" aria-label="Breadcrumb">
              <button onClick={() => selectCategory(null)} type="button">Home</button>
              <span aria-hidden="true">/</span>
              <strong>{selectedCategoryItem?.name ?? 'All videos'}</strong>
            </div>
          </div>

          {mobileCategoryOpen && (
            <>
              <button
                aria-label="Close video categories"
                className="mobile-category-scrim"
                onClick={() => setMobileCategoryOpen(false)}
                type="button"
              />
              <aside aria-label="Browse video categories" aria-modal="true" className="mobile-category-drawer" role="dialog">
                <div className="mobile-category-drawer__header">
                  <div>
                    <span>Browse</span>
                    <strong>Video categories</strong>
                  </div>
                  <button
                    aria-label="Close video categories"
                    className="mobile-category-drawer__close"
                    onClick={() => setMobileCategoryOpen(false)}
                    type="button"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <button
                  className={`mobile-category-drawer__item${selectedCategoryItem ? '' : ' is-active'}`}
                  onClick={() => selectCategory(null)}
                  type="button"
                >
                  <span>All videos</span>
                  <small>{formatCompactNumber(videos.length)}</small>
                </button>
                <div className="mobile-category-drawer__label">Popular categories</div>
                <div className="mobile-category-drawer__list">
                  {categoryItems.map((category) => (
                    <button
                      className={`mobile-category-drawer__item${selectedCategoryItem?.key === category.key ? ' is-active' : ''}`}
                      key={category.key}
                      onClick={() => selectCategory(category.key)}
                      type="button"
                    >
                      <span>{category.name}</span>
                      <small>{formatCompactNumber(category.count)}</small>
                    </button>
                  ))}
                </div>
                {categoryItems.length === 0 && (
                  <p className="mobile-category-drawer__empty">Categories will appear as videos are published.</p>
                )}
              </aside>
            </>
          )}

          <section className="mobile-browse" aria-label="Samsar video library">
          {selectedCategoryItem ? (
            <div className="mobile-category-results">
              <div className="mobile-category-results__heading">
                <span className="category-results__eyebrow">Category</span>
                <h1>{selectedCategoryItem.name}</h1>
                <p>{formatCompactNumber(categoryResults.length)} videos in this collection</p>
              </div>
              {categoryResults.length === 0 ? (
                <div className="library-state library-state--inline">
                  <h2>No videos in this category yet.</h2>
                  <p>Try another popular category.</p>
                </div>
              ) : (
                <>
                  {categoryLandscapeResults.length > 0 && (
                    <section className="mobile-browse__section mobile-category-results__group" aria-labelledby="mobile-category-landscape-title">
                      <div className="mobile-browse__section-heading">
                        <h2 id="mobile-category-landscape-title">Landscape</h2>
                        <span>{formatCompactNumber(categoryLandscapeResults.length)} videos</span>
                      </div>
                      <div className="mobile-browse__landscape-stack">
                        {categoryLandscapeResults.map((video) => (
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
                  {categoryPortraitResults.length > 0 && (
                    <section className="mobile-browse__section mobile-category-results__group" aria-labelledby="mobile-category-portrait-title">
                      <div className="mobile-browse__section-heading">
                        <h2 id="mobile-category-portrait-title">Portrait</h2>
                        <span>{formatCompactNumber(categoryPortraitResults.length)} videos</span>
                      </div>
                      <div className="mobile-browse__portrait-grid">
                        {categoryPortraitResults.map((video) => (
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
            </div>
          ) : rankedVideos.length === 0 ? (
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
                <section className="mobile-browse__section" aria-label="Featured videos">
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
        </>
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
          recommendationsError={recommendationsError && visibleSelectedRecommendations.length === 0}
          recommendationsLoading={recommendationsLoading}
          video={selectedCurrent}
        />
      )}
      {toast && <div className="gallery-toast" role="status">{toast}</div>}
    </>
  );
}
