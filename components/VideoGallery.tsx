/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import {
  FormEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { CSSProperties } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from 'react';
import type {
  PublishedVideo,
  VideoComment,
  VideoCommentState,
  VideoStats
} from '@/lib/types';
import {
  normalizeComment,
  parseCommentsPayload
} from '@/lib/comments';
import VideoOverlayContent from './VideoOverlayContent';
import volumeStyles from './MobileVolumeControl.module.css';

type PublishedVideoPayload = Partial<PublishedVideo> & Record<string, unknown>;

interface InteractionState {
  liking: boolean;
  sharing: boolean;
}

type VideoBooleanMap = Record<string, boolean>;
type VideoStringMap = Record<string, string>;

type VideoAspectLayout = 'landscape' | 'portrait' | 'square';
type GalleryViewMode = 'desktop' | 'mobile';
type GalleryDisplayMode = 'feed' | 'grid';
type GalleryAspectFilter = 'landscape' | 'portrait';

interface MobileVideoPlayOptions {
  force?: boolean;
  muted?: boolean;
  volume?: number;
}

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

const DESKTOP_PAGE_SIZE = 24;
const MOBILE_INITIAL_PAGE_SIZE = 5;
const MOBILE_PAGE_SIZE = 5;
const MOBILE_PREFETCH_THRESHOLD = 2;
const MOBILE_PRELOAD_AHEAD = 2;
const MOBILE_PRELOAD_BEHIND = 1;
const MOBILE_BREAKPOINT = 768;
const DEFAULT_MOBILE_VOLUME = 0.65;
const MIN_AUDIBLE_VOLUME = 0.02;
const MOBILE_VOLUME_HIDE_DELAY = 2200;
const DESKTOP_CONTROLS_HIDE_DELAY = 1700;
const MEDIA_HAVE_CURRENT_DATA = 2;
const MEDIA_HAVE_FUTURE_DATA = 3;
const MEDIA_NETWORK_EMPTY = 0;
const VOLUME_STORAGE_KEY = 'samsar-gallery/mobile-volume';
const MUTED_STORAGE_KEY = 'samsar-gallery/mobile-muted';
const AUTOPLAY_STORAGE_KEY = 'samsar-gallery/mobile-autoplay';
const DISPLAY_MODE_STORAGE_KEY = 'samsar-gallery/display-mode';
const DEFAULT_DESKTOP_ASPECT_RATIO = 9 / 16;

const clampVolume = (value: number): number =>
  Math.min(1, Math.max(0, value));

const DEFAULT_INTERACTION_STATE: InteractionState = Object.freeze({
  liking: false,
  sharing: false
});

const createInitialCommentState = (): VideoCommentState => ({
  items: [],
  nextCursor: null,
  hasMore: false,
  isLoading: false,
  isPosting: false,
  error: null,
  hasLoadedInitial: false
});

const isVideoComment = (value: unknown): value is VideoComment => {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    (typeof (value as { text?: unknown }).text === 'string' ||
      typeof (value as { text?: unknown }).text === 'number')
  );
};

const coerceCommentsPayload = (
  payload: unknown
): { items: VideoComment[]; nextCursor: string | null; hasMore: boolean } => {
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    const rawItems = (payload as { items: unknown[] }).items;
    const normalizedItems = rawItems
      .map((item) => {
        if (isVideoComment(item)) {
          return {
            ...item,
            text: typeof item.text === 'string' ? item.text : `${item.text}`
          };
        }
        return normalizeComment(item);
      })
      .filter((item): item is VideoComment => Boolean(item));

    const parent = payload as {
      nextCursor?: unknown;
      hasMore?: unknown;
      pagination?: { hasMore?: unknown; nextCursor?: unknown };
    };

    const nextCursor =
      typeof parent.nextCursor === 'string' && parent.nextCursor.length > 0
        ? parent.nextCursor
        : typeof parent.pagination?.nextCursor === 'string' &&
          parent.pagination.nextCursor.length > 0
        ? parent.pagination.nextCursor
        : null;

    const hasMoreValue =
      typeof parent.hasMore === 'boolean'
        ? parent.hasMore
        : typeof parent.pagination?.hasMore === 'boolean'
        ? parent.pagination.hasMore
        : null;

    return {
      items: normalizedItems,
      nextCursor,
      hasMore: hasMoreValue ?? Boolean(nextCursor)
    };
  }

  return parseCommentsPayload(payload);
};

const normalizeVideo = (payload: unknown): PublishedVideo | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as PublishedVideoPayload;
  const recordMap = payload as Record<string, unknown>;
  const id =
    typeof record.id === 'string' && record.id
      ? record.id
      : typeof recordMap._id === 'string' && recordMap._id
      ? (recordMap._id as string)
      : null;
  const videoUrl =
    typeof record.videoUrl === 'string' ? record.videoUrl.trim() : '';

  if (!id || !videoUrl) {
    return null;
  }

  const statsSource = (record.stats ?? {}) as Record<string, unknown>;
  const stats: VideoStats = {
    likes: Number(statsSource.likes ?? 0) || 0,
    comments: Number(statsSource.comments ?? 0) || 0,
    shares: Number(statsSource.shares ?? 0) || 0
  };

  const tagsSource = record.tags;
  const tags =
    Array.isArray(tagsSource)
      ? tagsSource
          .filter((tag) => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined;

  const createdAtRaw = record.createdAt as unknown;
  const createdAt =
    typeof createdAtRaw === 'string'
      ? createdAtRaw
      : createdAtRaw instanceof Date
      ? createdAtRaw.toISOString()
      : createdAtRaw
      ? new Date(createdAtRaw as string | number | Date).toISOString()
      : null;

  const createdByRaw = record.createdBy;
  let createdBy: string | null = null;
  if (typeof createdByRaw === 'string') {
    createdBy = createdByRaw;
  } else if (
    createdByRaw &&
    typeof createdByRaw === 'object' &&
    'toString' in createdByRaw &&
    typeof (createdByRaw as { toString: () => string }).toString === 'function'
  ) {
    createdBy = (createdByRaw as { toString: () => string }).toString();
  }

  let aspectRatioCandidate: string | null = null;
  if (typeof record.aspectRatio === 'string' && record.aspectRatio.trim().length > 0) {
    aspectRatioCandidate = record.aspectRatio.trim();
  } else if (
    typeof (record as { publishedAspectRatio?: unknown }).publishedAspectRatio === 'string'
  ) {
    const publishedAspectRatio = (record as { publishedAspectRatio: string }).publishedAspectRatio;
    if (publishedAspectRatio.trim().length > 0) {
      aspectRatioCandidate = publishedAspectRatio.trim();
    }
  } else if (typeof recordMap.aspect_ratio === 'string' && recordMap.aspect_ratio.trim().length > 0) {
    aspectRatioCandidate = recordMap.aspect_ratio.trim();
  }

  const posterUrl =
    typeof record.posterUrl === 'string' && record.posterUrl.trim().length > 0
      ? record.posterUrl.trim()
      : typeof recordMap.splashImage === 'string' && recordMap.splashImage.trim().length > 0
      ? recordMap.splashImage.trim()
      : typeof recordMap.thumbnailUrl === 'string' && recordMap.thumbnailUrl.trim().length > 0
      ? recordMap.thumbnailUrl.trim()
      : typeof recordMap.thumbnail === 'string' && recordMap.thumbnail.trim().length > 0
      ? recordMap.thumbnail.trim()
      : undefined;

  return {
    id,
    videoUrl,
    posterUrl,
    title:
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title.trim()
        : 'Untitled Video',
    description:
      typeof record.description === 'string' ? record.description.trim() : '',
    originalPrompt:
      typeof record.originalPrompt === 'string'
        ? record.originalPrompt.trim()
        : undefined,
    tags,
    creatorHandle:
      typeof record.creatorHandle === 'string'
        ? record.creatorHandle.trim()
        : undefined,
    createdBy,
    sessionId:
      typeof record.sessionId === 'string' ? record.sessionId : null,
    createdAt,
    stats,
    viewerHasLiked: Boolean(record.viewerHasLiked),
    isBotUser: Boolean(record.isBotUser),
    aspectRatio: aspectRatioCandidate
  };
};

const parseAspectRatio = (value?: string | null): number => {
  if (!value || typeof value !== 'string') {
    return DEFAULT_DESKTOP_ASPECT_RATIO;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_DESKTOP_ASPECT_RATIO;
  }

  const ratioMatch = trimmed.match(
    /(\d*\.?\d+)\s*[:x/×X]\s*(\d*\.?\d+)/
  );
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue;
  }

  switch (trimmed.toLowerCase()) {
    case 'square':
      return 1;
    case 'landscape':
      return 16 / 9;
    case 'portrait':
    case 'vertical':
      return DEFAULT_DESKTOP_ASPECT_RATIO;
    default:
      return DEFAULT_DESKTOP_ASPECT_RATIO;
  }
};

const formatAspectRatioComponent = (value: number): string => {
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded)
    ? `${rounded}`
    : `${rounded}`.replace(/\.?0+$/, '');
};

const getAspectRatioCssValue = (value?: string | null): string => {
  if (!value || typeof value !== 'string') {
    return '9 / 16';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '9 / 16';
  }

  const ratioMatch = trimmed.match(
    /(\d*\.?\d+)\s*[:x/×X]\s*(\d*\.?\d+)/
  );
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return `${formatAspectRatioComponent(width)} / ${formatAspectRatioComponent(height)}`;
    }
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return formatAspectRatioComponent(numericValue);
  }

  switch (trimmed.toLowerCase()) {
    case 'landscape':
      return '16 / 9';
    case 'square':
      return '1 / 1';
    case 'portrait':
    case 'vertical':
    default:
      return '9 / 16';
  }
};

const getAspectRatioLayout = (
  aspectRatio?: string | null
): VideoAspectLayout => {
  const ratio = parseAspectRatio(aspectRatio);

  if (Math.abs(ratio - 1) <= 0.04) {
    return 'square';
  }

  return ratio > 1 ? 'landscape' : 'portrait';
};

const isVisibleInGalleryMode = (
  video: PublishedVideo,
  aspectFilter: GalleryAspectFilter
): boolean => {
  const hasExplicitAspectRatio =
    typeof video.aspectRatio === 'string' &&
    video.aspectRatio.trim().length > 0;

  if (!hasExplicitAspectRatio) {
    return true;
  }

  const aspectLayout = getAspectRatioLayout(video.aspectRatio);
  return aspectFilter === 'portrait'
    ? aspectLayout === 'portrait'
    : aspectLayout !== 'portrait';
};

const getMosaicTileStyle = (video: PublishedVideo): CSSProperties =>
  ({
    ['--gallery-tile-aspect-ratio' as '--gallery-tile-aspect-ratio']:
      getAspectRatioCssValue(video.aspectRatio)
  } as CSSProperties);

const getAverageAspectRatio = (
  videos: PublishedVideo[],
  aspectFilter: GalleryAspectFilter
): number => {
  if (videos.length === 0) {
    return aspectFilter === 'portrait' ? 9 / 16 : 16 / 9;
  }

  const totalAspectRatio = videos.reduce(
    (total, video) => total + parseAspectRatio(video.aspectRatio),
    0
  );

  return totalAspectRatio / videos.length;
};

const getMosaicGridStyle = (
  viewMode: GalleryViewMode,
  aspectFilter: GalleryAspectFilter,
  videos: PublishedVideo[],
  containerAspectRatio: number
): CSSProperties | undefined => {
  if (viewMode !== 'desktop') {
    return undefined;
  }

  const safeCount = Math.max(1, videos.length);
  const targetAspectRatio = getAverageAspectRatio(videos, aspectFilter);
  const safeContainerAspectRatio = Number.isFinite(containerAspectRatio)
    ? Math.max(0.4, Math.min(containerAspectRatio, 4))
    : 16 / 9;
  const maxColumns = Math.min(
    safeCount,
    aspectFilter === 'portrait' ? 6 : 4
  );
  let bestColumns = 1;
  let bestRows = safeCount;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let candidateColumns = 1; candidateColumns <= maxColumns; candidateColumns += 1) {
    const candidateRows = Math.ceil(safeCount / candidateColumns);
    const emptySlots = candidateColumns * candidateRows - safeCount;
    const cellAspectRatio =
      (safeContainerAspectRatio * candidateRows) / candidateColumns;
    const aspectScore = Math.abs(
      Math.log(cellAspectRatio / targetAspectRatio)
    );
    const emptySlotScore = emptySlots / safeCount;
    const score = aspectScore + emptySlotScore * 0.72;

    if (score < bestScore) {
      bestScore = score;
      bestColumns = candidateColumns;
      bestRows = candidateRows;
    }
  }

  return {
    ['--gallery-grid-columns' as '--gallery-grid-columns']: `${bestColumns}`,
    ['--gallery-grid-rows' as '--gallery-grid-rows']: `${bestRows}`
  } as CSSProperties;
};

const greatestCommonDivisor = (left: number, right: number): number => {
  let currentLeft = Math.abs(Math.trunc(left));
  let currentRight = Math.abs(Math.trunc(right));

  while (currentRight !== 0) {
    const remainder = currentLeft % currentRight;
    currentLeft = currentRight;
    currentRight = remainder;
  }

  return currentLeft || 1;
};

const getIntrinsicAspectRatio = (
  videoElement: HTMLVideoElement
): string | null => {
  const width = Math.round(videoElement.videoWidth);
  const height = Math.round(videoElement.videoHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
};

const mergeVideos = (
  existing: PublishedVideo[],
  incoming: PublishedVideo[]
) => {
  if (existing.length === 0) {
    return incoming;
  }

  const map = new Map(existing.map((video) => [video.id, video]));
  const result = [...existing];

  incoming.forEach((video) => {
    const index = result.findIndex((item) => item.id === video.id);
    if (index === -1) {
      result.push(video);
      map.set(video.id, video);
    } else {
      result[index] = {
        ...result[index],
        ...video,
        stats: video.stats,
        viewerHasLiked: video.viewerHasLiked
      };
    }
  });

  return result;
};

const dispatchAuthModal = (view: 'login' | 'register' = 'login') => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('samsar:open-auth', { detail: { view } })
  );
};

const getShareUrl = (video: PublishedVideo) => {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('videoId', video.id);
    return url.toString();
  }

  return video.videoUrl || '';
};

interface CommentDrawerProps {
  video: PublishedVideo;
  state: VideoCommentState;
  open: boolean;
  onClose: () => void;
  onSubmit: (videoId: string, text: string) => Promise<void>;
  onLoadMore: (videoId: string) => Promise<void> | void;
}

function CommentDrawer({
  video,
  state,
  open,
  onClose,
  onSubmit,
  onLoadMore
}: CommentDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setText('');
      setError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 160);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, video.id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please enter a comment before sending.');
      return;
    }

    try {
      setError(null);
      await onSubmit(video.id, trimmed);
      setText('');
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to post your comment.';
      setError(message);
    }
  };

  const handleLoadMore = () => {
    if (!state.hasMore || state.isLoading) {
      return;
    }
    void onLoadMore(video.id);
  };

  return (
    <div className={`comment-drawer${open ? ' comment-drawer--open' : ''}`}>
      <div className="comment-drawer__backdrop" onClick={onClose} />
      <div className="comment-drawer__panel" role="dialog" aria-modal="true">
        <header className="comment-drawer__header">
          <h3>Comments</h3>
          <button
            type="button"
            className="comment-drawer__close"
            onClick={onClose}
            aria-label="Close comments"
          >
            ×
          </button>
        </header>

        {state.error && (
          <p className="comment-drawer__error" role="alert">
            {state.error}
          </p>
        )}

        <div className="comment-drawer__list">
          {state.items.map((comment) => (
            <article className="comment-drawer__item" key={comment.id}>
              <div className="comment-drawer__meta">
                <span className="comment-drawer__author">
                  {comment.isBotUser
                    ? `${comment.creatorHandle} [bot]`
                    : comment.creatorHandle}
                </span>
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="comment-drawer__text">{comment.text}</p>
            </article>
          ))}

          {state.isLoading && (
            <div className="comment-drawer__loader">Loading comments…</div>
          )}

          {state.hasMore && !state.isLoading && (
            <button
              type="button"
              className="comment-drawer__load-more"
              onClick={handleLoadMore}
            >
              Load more
            </button>
          )}

          {!state.isLoading && state.items.length === 0 && (
            <p className="comment-drawer__empty">
              Be the first to leave a comment.
            </p>
          )}
        </div>

        <form className="comment-drawer__form" onSubmit={handleSubmit}>
          <label htmlFor="drawer-comment-input" className="sr-only">
            Add a comment
          </label>
          <input
            id="drawer-comment-input"
            ref={inputRef}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Add a comment…"
            disabled={state.isPosting}
          />
          <button
            type="submit"
            disabled={state.isPosting || text.trim().length === 0}
          >
            {state.isPosting ? 'Posting…' : 'Post'}
          </button>
        </form>

        {error && (
          <p className="comment-drawer__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function VideoGallery() {
  const [videos, setVideos] = useState<PublishedVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [commentPanelVideoId, setCommentPanelVideoId] = useState<string | null>(
    null
  );
  const [initialVideoId, setInitialVideoId] = useState<string | null | undefined>(
    undefined
  );
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [activeFeedIndex, setActiveFeedIndex] = useState<number>(0);
  const [pendingMobileVideoId, setPendingMobileVideoId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [supportsIntersectionObserver, setSupportsIntersectionObserver] =
    useState<boolean>(true);
  const [commentsMap, setCommentsMap] = useState<
    Record<string, VideoCommentState>
  >({});
  const [interactionMap, setInteractionMap] = useState<
    Record<string, InteractionState>
  >({});
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileVolume, setMobileVolume] = useState<number>(
    DEFAULT_MOBILE_VOLUME
  );
  const [mobileMuted, setMobileMuted] = useState<boolean>(true);
  const [isMobileAutoplayEnabled, setIsMobileAutoplayEnabled] =
    useState<boolean>(true);
  const [showMobileVolume, setShowMobileVolume] = useState<boolean>(false);
  const [desktopMuted, setDesktopMuted] = useState<boolean>(true);
  const [desktopVolume, setDesktopVolume] = useState<number>(
    DEFAULT_MOBILE_VOLUME
  );
  const [isDesktopPlaying, setIsDesktopPlaying] = useState<boolean>(true);
  const [desktopControlsVisible, setDesktopControlsVisible] =
    useState<boolean>(false);
  const [displayMode, setDisplayMode] = useState<GalleryDisplayMode>('feed');
  const [aspectFilter, setAspectFilter] =
    useState<GalleryAspectFilter>('landscape');
  const [desktopGridAspectRatio, setDesktopGridAspectRatio] =
    useState<number>(16 / 9);
  const [bufferingVideoIds, setBufferingVideoIds] = useState<VideoBooleanMap>(
    {}
  );
  const [videoPlaybackErrors, setVideoPlaybackErrors] =
    useState<VideoStringMap>({});

  const mobileFeedRef = useRef<HTMLDivElement | null>(null);
  const feedItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const desktopVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const isMountedRef = useRef<boolean>(false);
  const pendingCursorRef = useRef<string | null>(null);
  const authNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastAudibleVolumeRef = useRef<number>(DEFAULT_MOBILE_VOLUME);
  const adjustingVolumeRef = useRef<boolean>(false);
  const hasBootstrappedRef = useRef<boolean>(false);
  const autoplayBlockedRef = useRef<boolean>(false);
  const prefetchedMobileVideoIdsRef = useRef<Set<string>>(new Set());
  const initialMobilePrefetchRequestedRef = useRef<boolean>(false);
  const mobileActiveRafRef = useRef<number | null>(null);
  const mobileAutoplayRaiseTimeoutRef = useRef<number | null>(null);
  const userSelectedAspectRef = useRef<boolean>(false);
  const desktopControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const commentsMapRef = useRef<Record<string, VideoCommentState>>(commentsMap);

  const galleryViewMode: GalleryViewMode = isMobile ? 'mobile' : 'desktop';
  const visibleVideos = useMemo(
    () =>
      videos.filter((video) =>
        isVisibleInGalleryMode(video, aspectFilter)
      ),
    [aspectFilter, videos]
  );
  const activeVisibleVideo =
    visibleVideos[activeFeedIndex] ?? visibleVideos[0] ?? null;

  useEffect(() => {
    commentsMapRef.current = commentsMap;
  }, [commentsMap]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateDesktopGridAspectRatio = () => {
      const topNav = document.querySelector('.top-nav');
      const topNavHeight =
        topNav instanceof HTMLElement
          ? topNav.getBoundingClientRect().height
          : 0;
      const galleryHeight = Math.max(1, window.innerHeight - topNavHeight);
      setDesktopGridAspectRatio(window.innerWidth / galleryHeight);
    };

    updateDesktopGridAspectRatio();
    window.addEventListener('resize', updateDesktopGridAspectRatio);

    return () =>
      window.removeEventListener('resize', updateDesktopGridAspectRatio);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storages: Storage[] = [];

    try {
      if ('localStorage' in window && window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch {
      // localStorage might be unavailable (e.g., private browsing). Ignore.
    }

    try {
      if ('sessionStorage' in window && window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch {
      // sessionStorage might be unavailable (e.g., private browsing). Ignore.
    }

    if (storages.length === 0) {
      return;
    }

    let storedVolumeRaw: string | null = null;
    let storedMutedRaw: string | null = null;
    let storedAutoplayRaw: string | null = null;
    let storedDisplayModeRaw: string | null = null;

    for (const storage of storages) {
      if (storedVolumeRaw === null) {
        try {
          storedVolumeRaw = storage.getItem(VOLUME_STORAGE_KEY);
        } catch {
          storedVolumeRaw = null;
        }
      }
      if (storedMutedRaw === null) {
        try {
          storedMutedRaw = storage.getItem(MUTED_STORAGE_KEY);
        } catch {
          storedMutedRaw = null;
        }
      }
      if (storedAutoplayRaw === null) {
        try {
          storedAutoplayRaw = storage.getItem(AUTOPLAY_STORAGE_KEY);
        } catch {
          storedAutoplayRaw = null;
        }
      }
      if (storedDisplayModeRaw === null) {
        try {
          storedDisplayModeRaw = storage.getItem(DISPLAY_MODE_STORAGE_KEY);
        } catch {
          storedDisplayModeRaw = null;
        }
      }
    }

    let restoredVolume: number | null = null;
    if (storedVolumeRaw !== null) {
      const parsed = Number.parseFloat(storedVolumeRaw);
      if (Number.isFinite(parsed)) {
        restoredVolume = clampVolume(parsed);
      }
    }

    let restoredMuted: boolean | null = null;
    if (storedMutedRaw !== null) {
      if (storedMutedRaw === '1' || storedMutedRaw === 'true') {
        restoredMuted = true;
      } else if (storedMutedRaw === '0' || storedMutedRaw === 'false') {
        restoredMuted = false;
      }
    }

    if (restoredVolume !== null) {
      setMobileVolume(restoredVolume);
      if (restoredVolume > MIN_AUDIBLE_VOLUME) {
        lastAudibleVolumeRef.current = restoredVolume;
      }
    }

    const effectiveMuted =
      restoredMuted ??
      (restoredVolume !== null
        ? restoredVolume <= MIN_AUDIBLE_VOLUME
        : null);

    if (effectiveMuted !== null) {
      setMobileMuted(effectiveMuted);
    }

    if (
      storedAutoplayRaw !== null &&
      (storedAutoplayRaw === '1' || storedAutoplayRaw === 'true')
    ) {
      setIsMobileAutoplayEnabled(true);
    }

    // Force autoplay on for each fresh load regardless of stored preference.
    setIsMobileAutoplayEnabled(true);

    if (storedDisplayModeRaw === 'feed' || storedDisplayModeRaw === 'grid') {
      setDisplayMode(storedDisplayModeRaw);
    }
  }, []);

  const promptLogin = useCallback((message: string) => {
    setAuthNotice(message);
    dispatchAuthModal('login');
  }, []);

  const updateInteractionState = useCallback(
    (videoId: string, patch: Partial<InteractionState>) => {
      setInteractionMap((previous) => {
        const base = previous[videoId] ?? DEFAULT_INTERACTION_STATE;
        return {
          ...previous,
          [videoId]: { ...base, ...patch }
        };
      });
    },
    []
  );

  const updateVideo = useCallback(
    (videoId: string, updater: (video: PublishedVideo) => PublishedVideo) => {
      setVideos((previous) =>
        previous.map((video) =>
          video.id === videoId ? updater(video) : video
        )
      );
    },
    []
  );

  const setVideoBuffering = useCallback((videoId: string, isBuffering: boolean) => {
    setBufferingVideoIds((previous) => {
      if (previous[videoId] === isBuffering) {
        return previous;
      }

      return {
        ...previous,
        [videoId]: isBuffering
      };
    });
  }, []);

  const clearVideoPlaybackError = useCallback((videoId: string) => {
    setVideoPlaybackErrors((previous) => {
      if (!(videoId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[videoId];
      return next;
    });
  }, []);

  const setVideoPlaybackError = useCallback((videoId: string, message: string) => {
    setVideoPlaybackErrors((previous) => {
      if (previous[videoId] === message) {
        return previous;
      }

      return {
        ...previous,
        [videoId]: message
      };
    });
    setVideoBuffering(videoId, false);
  }, [setVideoBuffering]);

  const markVideoReady = useCallback(
    (videoId: string) => {
      setVideoBuffering(videoId, false);
      clearVideoPlaybackError(videoId);
    },
    [clearVideoPlaybackError, setVideoBuffering]
  );

  const handleVideoLoadedData = useCallback(
    (videoId: string) => {
      markVideoReady(videoId);
    },
    [markVideoReady]
  );

  const handleVideoPlaying = useCallback(
    (videoId: string) => {
      markVideoReady(videoId);
    },
    [markVideoReady]
  );

  const handleVideoWaiting = useCallback(
    (videoId: string, event: SyntheticEvent<HTMLVideoElement>) => {
      if (event.currentTarget.readyState >= MEDIA_HAVE_FUTURE_DATA) {
        return;
      }

      setVideoBuffering(videoId, true);
    },
    [setVideoBuffering]
  );

  const handleVideoStalled = useCallback(
    (videoId: string) => {
      setVideoBuffering(videoId, true);
    },
    [setVideoBuffering]
  );

  const handleVideoError = useCallback(
    (videoId: string, event: SyntheticEvent<HTMLVideoElement>) => {
      const message =
        event.currentTarget.error?.message ||
        'This video could not be loaded.';
      setVideoPlaybackError(videoId, message);
    },
    [setVideoPlaybackError]
  );

  const handleDesktopVideoReady = useCallback(
    (videoId: string, isActive: boolean, event: SyntheticEvent<HTMLVideoElement>) => {
      markVideoReady(videoId);

      if (!isActive || isMobile || !isDesktopPlaying || displayMode !== 'feed') {
        return;
      }

      void event.currentTarget.play().catch((playError: unknown) => {
        if (
          playError instanceof DOMException &&
          playError.name === 'NotAllowedError'
        ) {
          setIsDesktopPlaying(false);
          return;
        }

        const message =
          playError instanceof Error && playError.message
            ? playError.message
            : 'This video could not be played.';
        setVideoPlaybackError(videoId, message);
      });
    },
    [
      displayMode,
      isDesktopPlaying,
      isMobile,
      markVideoReady,
      setVideoPlaybackError
    ]
  );

  const clearVolumeOverlayTimeout = useCallback(() => {
    if (volumeOverlayTimeoutRef.current) {
      clearTimeout(volumeOverlayTimeoutRef.current);
      volumeOverlayTimeoutRef.current = null;
    }
  }, []);

  const showVolumeOverlay = useCallback(() => {
    setShowMobileVolume(true);
    clearVolumeOverlayTimeout();
  }, [clearVolumeOverlayTimeout]);

  const revealVolumeOverlay = useCallback(() => {
    showVolumeOverlay();
    volumeOverlayTimeoutRef.current = setTimeout(() => {
      setShowMobileVolume(false);
      volumeOverlayTimeoutRef.current = null;
    }, MOBILE_VOLUME_HIDE_DELAY);
  }, [showVolumeOverlay]);

  const playMobileVideo = useCallback(
    (videoElement: HTMLVideoElement, options?: { force?: boolean }) => {
      if (!(videoElement instanceof HTMLVideoElement)) {
        return false;
      }

      const shouldForce = Boolean(options?.force);
      const videoId = videoElement.dataset.videoId;
      if (videoId && videoElement.readyState < MEDIA_HAVE_CURRENT_DATA) {
        setVideoBuffering(videoId, true);
      }

      if (!shouldForce) {
        if (!isMobile || !isMobileAutoplayEnabled) {
          return false;
        }

        if (autoplayBlockedRef.current) {
          return false;
        }
      } else {
        autoplayBlockedRef.current = false;
      }

      const retryMutedPlay = () => {
        try {
          videoElement.muted = true;
          videoElement.volume = 0;
          const retryAttempt = videoElement.play();
          if (retryAttempt && typeof retryAttempt.catch === 'function') {
            retryAttempt.catch(() => undefined);
          }
        } catch {
          // Ignore retry failures; the next user gesture can try again.
        }
      };

      try {
        const playAttempt = videoElement.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
          playAttempt.catch((error) => {
            if (
              error instanceof DOMException &&
              (error.name === 'NotAllowedError' ||
                error.name === 'NotSupportedError')
            ) {
              if (!shouldForce) {
                autoplayBlockedRef.current = true;
              } else {
                retryMutedPlay();
              }
              if (videoId && error.name === 'NotSupportedError') {
                setVideoPlaybackError(
                  videoId,
                  'This video format is not supported.'
                );
              }
            }
          });
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === 'NotAllowedError' ||
            error.name === 'NotSupportedError')
        ) {
          if (!shouldForce) {
            autoplayBlockedRef.current = true;
          } else {
            retryMutedPlay();
          }
          if (videoId && error.name === 'NotSupportedError') {
            setVideoPlaybackError(
              videoId,
              'This video format is not supported.'
            );
          }
        }
      }

      return true;
    },
    [
      isMobile,
      isMobileAutoplayEnabled,
      setVideoBuffering,
      setVideoPlaybackError
    ]
  );

  const clearScheduledAutoplayRaise = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      mobileAutoplayRaiseTimeoutRef.current !== null
    ) {
      window.clearTimeout(mobileAutoplayRaiseTimeoutRef.current);
    }

    mobileAutoplayRaiseTimeoutRef.current = null;
  }, []);

  const ensureMobileVideoPlaying = useCallback(
    (index: number, options?: MobileVideoPlayOptions) => {
      const container = feedItemRefs.current[index];
      const videoElement =
        container?.querySelector('video') ?? null;
      if (!(videoElement instanceof HTMLVideoElement)) {
        return;
      }

      const shouldForce = Boolean(options?.force);

      if (shouldForce) {
        clearScheduledAutoplayRaise();

        const requestedVolume =
          typeof options?.volume === 'number'
            ? clampVolume(options.volume)
            : clampVolume(mobileVolume);
        const shouldMute =
          typeof options?.muted === 'boolean'
            ? options.muted
            : mobileMuted || requestedVolume <= MIN_AUDIBLE_VOLUME;
        const resolvedVolume = shouldMute ? 0 : requestedVolume;

        try {
          videoElement.volume = resolvedVolume;
          videoElement.muted = shouldMute;
        } catch {
          // Ignore setter failures on unsupported browsers.
        }

        playMobileVideo(videoElement, { force: true });
        return;
      }

      clearScheduledAutoplayRaise();

      try {
        videoElement.muted = true;
        videoElement.volume = 0;
      } catch {
        // Ignore setter failures on unsupported browsers.
      }

      playMobileVideo(videoElement);
    },
    [
      clearScheduledAutoplayRaise,
      mobileMuted,
      mobileVolume,
      playMobileVideo
    ]
  );

  const ensureActiveMobileVideoPlaying = useCallback(
    (options?: MobileVideoPlayOptions) => {
      if (!isMobile) {
        return;
      }

      ensureMobileVideoPlaying(activeFeedIndex, options);
    },
    [activeFeedIndex, ensureMobileVideoPlaying, isMobile]
  );

  const evaluateMobileActiveVideo = useCallback(() => {
    if (!isMobile) {
      return;
    }

    const feed = mobileFeedRef.current;
    if (!feed) {
      return;
    }

    const feedRect = feed.getBoundingClientRect();
    const viewportTop = feedRect.top;
    const viewportBottom = feedRect.bottom;
    const viewportCenter = viewportTop + feedRect.height / 2;

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    feedItemRefs.current.forEach((element, index) => {
      if (!(element instanceof HTMLDivElement)) {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }

      if (rect.bottom <= viewportTop || rect.top >= viewportBottom) {
        return;
      }

      const elementCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elementCenter - viewportCenter);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex === -1) {
      return;
    }

    setActiveFeedIndex((previousIndex) => {
      if (previousIndex === bestIndex) {
        return previousIndex;
      }
      return bestIndex;
    });

    ensureMobileVideoPlaying(bestIndex);
  }, [ensureMobileVideoPlaying, isMobile]);

  const scheduleMobileActiveEvaluation = useCallback(() => {
    if (!isMobile || typeof window === 'undefined') {
      return;
    }

    if (mobileActiveRafRef.current !== null) {
      return;
    }

    mobileActiveRafRef.current = window.requestAnimationFrame(() => {
      mobileActiveRafRef.current = null;
      evaluateMobileActiveVideo();
    });
  }, [evaluateMobileActiveVideo, isMobile]);

  const resumeAutoplayFromGesture = useCallback(() => {
    if (!isMobile || !isMobileAutoplayEnabled) {
      return;
    }

    const container = feedItemRefs.current[activeFeedIndex];
    const videoElement =
      container?.querySelector('video') ?? null;
    if (!(videoElement instanceof HTMLVideoElement)) {
      return;
    }

    if (!videoElement.paused && !autoplayBlockedRef.current) {
      return;
    }

    ensureMobileVideoPlaying(activeFeedIndex, { force: true });
  }, [
    activeFeedIndex,
    ensureMobileVideoPlaying,
    isMobile,
    isMobileAutoplayEnabled
  ]);

  const prefetchMobileVideoAt = useCallback(
    (index: number) => {
      if (!isMobile || typeof window === 'undefined') {
        return;
      }

      if (index < 0 || index >= visibleVideos.length) {
        return;
      }

      const video = visibleVideos[index];
      if (!video || prefetchedMobileVideoIdsRef.current.has(video.id)) {
        return;
      }

      const connection =
        typeof navigator !== 'undefined'
          ? (navigator as NavigatorWithConnection).connection
          : undefined;
      if (connection?.saveData) {
        return;
      }

      const container = feedItemRefs.current[index];
      const element = container?.querySelector('video');
      if (!(element instanceof HTMLVideoElement)) {
        return;
      }

      prefetchedMobileVideoIdsRef.current.add(video.id);

      if (element.preload !== 'auto') {
        element.preload = 'auto';
      }

      if (element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        return;
      }

      const handleCanPlay = () => {
        element.removeEventListener('canplay', handleCanPlay);
        element.pause();
        try {
          element.currentTime = 0;
        } catch {
          // Some browsers throw if currentTime is set before metadata is ready.
        }
      };

      element.addEventListener('canplay', handleCanPlay, { once: true });

      try {
        element.load();
      } catch {
        // Ignore load errors on browsers that do not support manual preloading.
        element.removeEventListener('canplay', handleCanPlay);
        prefetchedMobileVideoIdsRef.current.delete(video.id);
      }
    },
    [isMobile, visibleVideos]
  );

  const commitMobileVolume = useCallback(
    (nextVolume: number) => {
      const clamped = clampVolume(nextVolume);
      const shouldMute = clamped <= MIN_AUDIBLE_VOLUME;
      const resolvedVolume = shouldMute ? 0 : clamped;

      setMobileVolume(resolvedVolume);
      setMobileMuted(shouldMute);

      if (!shouldMute) {
        lastAudibleVolumeRef.current = resolvedVolume;
      }

      if (!isMobile) {
        return;
      }

      clearScheduledAutoplayRaise();

      const activeElement =
        feedItemRefs.current[activeFeedIndex]?.querySelector('video');

      if (activeElement instanceof HTMLVideoElement) {
        activeElement.volume = resolvedVolume;
        activeElement.muted = shouldMute;

        if (!shouldMute) {
          playMobileVideo(activeElement, { force: true });
        }
      } else if (!shouldMute) {
        ensureActiveMobileVideoPlaying({ force: true });
      }
    },
    [
      activeFeedIndex,
      clearScheduledAutoplayRaise,
      ensureActiveMobileVideoPlaying,
      isMobile,
      playMobileVideo
    ]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storages: Storage[] = [];

    try {
      if ('localStorage' in window && window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch {
      // localStorage might be unavailable (e.g., private browsing). Ignore.
    }

    try {
      if ('sessionStorage' in window && window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch {
      // sessionStorage might be unavailable (e.g., private browsing). Ignore.
    }

    if (storages.length === 0) {
      return;
    }

    const volumeValue = String(mobileVolume);
    const mutedValue =
      mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME ? '1' : '0';
    const autoplayValue = isMobileAutoplayEnabled ? '1' : '0';

    storages.forEach((storage) => {
      try {
        storage.setItem(VOLUME_STORAGE_KEY, volumeValue);
        storage.setItem(MUTED_STORAGE_KEY, mutedValue);
        storage.setItem(AUTOPLAY_STORAGE_KEY, autoplayValue);
      } catch {
        // Storage writes might fail (e.g., quota exceeded). Ignore.
      }
    });
  }, [isMobileAutoplayEnabled, mobileMuted, mobileVolume]);

  const updateVolumeFromTrack = useCallback(
    (track: HTMLDivElement, clientY: number) => {
      const rect = track.getBoundingClientRect();
      if (rect.height === 0) {
        return;
      }

      const ratio = (rect.bottom - clientY) / rect.height;
      commitMobileVolume(ratio);
    },
    [commitMobileVolume]
  );

  const handleVolumeToggle = useCallback(() => {
    const willUnmute = mobileMuted;

    if (willUnmute) {
      const fallback =
        mobileVolume > MIN_AUDIBLE_VOLUME
          ? mobileVolume
          : lastAudibleVolumeRef.current || DEFAULT_MOBILE_VOLUME;
      const target =
        fallback > MIN_AUDIBLE_VOLUME ? fallback : DEFAULT_MOBILE_VOLUME;

      commitMobileVolume(target);
    } else {
      if (mobileVolume > MIN_AUDIBLE_VOLUME) {
        lastAudibleVolumeRef.current = mobileVolume;
      }
      commitMobileVolume(0);
    }

    revealVolumeOverlay();
    ensureActiveMobileVideoPlaying(
      willUnmute && isMobileAutoplayEnabled ? { force: true } : undefined
    );
  }, [
    commitMobileVolume,
    ensureActiveMobileVideoPlaying,
    isMobileAutoplayEnabled,
    mobileMuted,
    mobileVolume,
    revealVolumeOverlay
  ]);

  const handleVolumePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      adjustingVolumeRef.current = true;
      showVolumeOverlay();

      const target = event.currentTarget;

      if (
        typeof target.focus === 'function' &&
        typeof document !== 'undefined' &&
        target !== document.activeElement
      ) {
        target.focus();
      }

      if (typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture errors on unsupported browsers.
        }
      }

      updateVolumeFromTrack(target, event.clientY);
      ensureActiveMobileVideoPlaying(
        isMobileAutoplayEnabled ? { force: true } : undefined
      );
    },
    [
      ensureActiveMobileVideoPlaying,
      isMobileAutoplayEnabled,
      isMobile,
      showVolumeOverlay,
      updateVolumeFromTrack
    ]
  );

  const handleVolumePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!adjustingVolumeRef.current) {
        return;
      }

      event.preventDefault();
      updateVolumeFromTrack(event.currentTarget, event.clientY);
      ensureActiveMobileVideoPlaying(
        isMobileAutoplayEnabled ? { force: true } : undefined
      );
    },
    [
      ensureActiveMobileVideoPlaying,
      isMobileAutoplayEnabled,
      updateVolumeFromTrack
    ]
  );

  const handleVolumePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!adjustingVolumeRef.current) {
        return;
      }

      event.preventDefault();
      adjustingVolumeRef.current = false;

      const target = event.currentTarget;

      if (typeof target.releasePointerCapture === 'function') {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture errors on unsupported browsers.
        }
      }

      revealVolumeOverlay();
    },
    [revealVolumeOverlay]
  );

  const updateVideoAspectRatio = useCallback(
    (videoId: string, nextAspectRatio: string) => {
      setVideos((previous) => {
        let didChange = false;

        const nextVideos = previous.map((video) => {
          if (video.id !== videoId) {
            return video;
          }

          const currentAspectRatio =
            typeof video.aspectRatio === 'string' ? video.aspectRatio.trim() : '';
          if (currentAspectRatio === nextAspectRatio) {
            return video;
          }

          didChange = true;
          return {
            ...video,
            aspectRatio: nextAspectRatio
          };
        });

        return didChange ? nextVideos : previous;
      });
    },
    []
  );

  const handleDesktopVideoLoadedMetadata = useCallback(
    (videoId: string, event: SyntheticEvent<HTMLVideoElement>) => {
      const nextAspectRatio = getIntrinsicAspectRatio(event.currentTarget);
      if (!nextAspectRatio) {
        return;
      }

      updateVideoAspectRatio(videoId, nextAspectRatio);
      if (event.currentTarget.readyState >= MEDIA_HAVE_CURRENT_DATA) {
        markVideoReady(videoId);
      }
    },
    [markVideoReady, updateVideoAspectRatio]
  );

  const handleMobileVideoLoadedMetadata = useCallback(
    (videoId: string, event: SyntheticEvent<HTMLVideoElement>) => {
      const videoElement = event.currentTarget;
      const nextAspectRatio = getIntrinsicAspectRatio(videoElement);
      if (nextAspectRatio) {
        updateVideoAspectRatio(videoId, nextAspectRatio);
      }

      if (videoElement.readyState >= MEDIA_HAVE_CURRENT_DATA) {
        markVideoReady(videoId);
      }

      if (!isMobile) {
        return;
      }

      const container = videoElement.closest('.mobile-feed__item');
      const indexAttribute = container?.getAttribute('data-index');
      const parsedIndex =
        indexAttribute != null ? Number.parseInt(indexAttribute, 10) : NaN;

      if (Number.isNaN(parsedIndex)) {
        return;
      }

      const isActiveVideo = parsedIndex === activeFeedIndex;
      const shouldMuteVideo =
        !isActiveVideo || isMobileAutoplayEnabled
          ? true
          : mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
      const resolvedVolume = shouldMuteVideo ? 0 : clampVolume(mobileVolume);

      try {
        videoElement.muted = shouldMuteVideo;
        videoElement.volume = resolvedVolume;
      } catch {
        // Ignore setter failures on unsupported browsers.
      }

      if (parsedIndex === activeFeedIndex) {
        ensureMobileVideoPlaying(parsedIndex);
      }
    },
    [
      activeFeedIndex,
      ensureMobileVideoPlaying,
      isMobile,
      isMobileAutoplayEnabled,
      mobileMuted,
      mobileVolume,
      markVideoReady,
      updateVideoAspectRatio
    ]
  );

  const handleMobileVideoCanPlay = useCallback(
    (videoId: string, index: number) => {
      markVideoReady(videoId);

      if (!isMobile || !isMobileAutoplayEnabled || index !== activeFeedIndex) {
        return;
      }

      ensureMobileVideoPlaying(index);
    },
    [
      activeFeedIndex,
      ensureMobileVideoPlaying,
      isMobile,
      isMobileAutoplayEnabled,
      markVideoReady
    ]
  );

  const handleMobileVideoClick = useCallback(
    (index: number) => {
      if (!isMobile) {
        return;
      }

      const container = feedItemRefs.current[index];
      const videoElement =
        container?.querySelector('video') ?? null;
      if (!(videoElement instanceof HTMLVideoElement)) {
        return;
      }

      const isCurrentActive = index === activeFeedIndex;

      const ensureAudibleVolume = () => {
        if (!mobileMuted && mobileVolume > MIN_AUDIBLE_VOLUME) {
          return mobileVolume;
        }

        const fallback =
          mobileVolume > MIN_AUDIBLE_VOLUME
            ? mobileVolume
            : lastAudibleVolumeRef.current || DEFAULT_MOBILE_VOLUME;
        const target =
          fallback > MIN_AUDIBLE_VOLUME ? fallback : DEFAULT_MOBILE_VOLUME;

        commitMobileVolume(target);
        return target;
      };

      if (!isCurrentActive) {
        setActiveFeedIndex(index);
        setIsMobileAutoplayEnabled(true);
        ensureMobileVideoPlaying(index, { force: true });
        return;
      }

      if (videoElement.paused) {
        setIsMobileAutoplayEnabled(true);
        const audibleVolume = ensureAudibleVolume();
        ensureMobileVideoPlaying(index, {
          force: true,
          muted: false,
          volume: audibleVolume
        });
        return;
      }

      videoElement.pause();
      clearScheduledAutoplayRaise();
      setIsMobileAutoplayEnabled(false);
    },
    [
      activeFeedIndex,
      clearScheduledAutoplayRaise,
      commitMobileVolume,
      ensureMobileVideoPlaying,
      isMobile,
      mobileMuted,
      mobileVolume
    ]
  );

  const handleMobileFeedItemClick = useCallback(
    (index: number, event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('a, button, input, [role="slider"]')
      ) {
        return;
      }

      handleMobileVideoClick(index);
    },
    [handleMobileVideoClick]
  );

  const handleVolumeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextVolume = mobileVolume;

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          nextVolume = mobileVolume + 0.05;
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          nextVolume = mobileVolume - 0.05;
          break;
        case 'PageUp':
          nextVolume = mobileVolume + 0.1;
          break;
        case 'PageDown':
          nextVolume = mobileVolume - 0.1;
          break;
        case 'Home':
          nextVolume = 0;
          break;
        case 'End':
          nextVolume = 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      commitMobileVolume(nextVolume);
      revealVolumeOverlay();
      ensureActiveMobileVideoPlaying(
        isMobileAutoplayEnabled ? { force: true } : undefined
      );
    },
    [
      commitMobileVolume,
      ensureActiveMobileVideoPlaying,
      isMobileAutoplayEnabled,
      mobileVolume,
      revealVolumeOverlay
    ]
  );

  const fetchVideos = useCallback(
    async (cursor?: string | null, options?: { background?: boolean }) => {
      if (!isMountedRef.current) {
        return;
      }

      const loadMore = Boolean(cursor);
      const isBackgroundFetch = Boolean(options?.background);
      pendingCursorRef.current = cursor ?? null;

      const effectiveLimit = (() => {
        if (typeof window !== 'undefined') {
          const currentlyMobile =
            window.innerWidth <= MOBILE_BREAKPOINT;
          if (currentlyMobile) {
            return loadMore
              ? MOBILE_PAGE_SIZE
              : MOBILE_INITIAL_PAGE_SIZE;
          }
        }
        return DESKTOP_PAGE_SIZE;
      })();

      if (loadMore) {
        if (!isBackgroundFetch) {
          setIsFetchingMore(true);
          setLoadMoreError(null);
        }
      } else {
        if (!isBackgroundFetch) {
          setIsLoading(true);
          setHasMore(true);
          setNextCursor(null);
          setError(null);
          prefetchedMobileVideoIdsRef.current.clear();
          initialMobilePrefetchRequestedRef.current = false;
        }
      }

      try {
        const params = new URLSearchParams({
          limit: `${effectiveLimit}`
        });
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
        const rawItems = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        const normalized = rawItems
          .map((item: unknown) => normalizeVideo(item))
          .filter(
            (item: PublishedVideo | null): item is PublishedVideo =>
              Boolean(item)
          );

        const totalCountFromPayload =
          typeof payload?.totalCount === 'number' &&
          Number.isFinite(payload.totalCount)
            ? payload.totalCount
            : null;

        let updatedVideos: PublishedVideo[] = [];
        setVideos((previous) => {
          if (loadMore || isBackgroundFetch) {
            const merged = mergeVideos(previous, normalized);
            updatedVideos = merged;
            return merged;
          }
          updatedVideos = normalized;
          return normalized;
        });

        const rawNextCursor =
          payload?.nextCursor ??
          payload?.cursor ??
          payload?.next?.cursor ??
          payload?.pagination?.nextCursor ??
          payload?.pagination?.cursor ??
          null;

        const newCursor =
          rawNextCursor != null && String(rawNextCursor).length > 0
            ? String(rawNextCursor)
            : null;
        const reachedEnd =
          (loadMore || isBackgroundFetch) && normalized.length === 0;
        const hasMoreValue =
          typeof payload?.hasMore === 'boolean'
            ? payload.hasMore
            : typeof payload?.pagination?.hasMore === 'boolean'
            ? payload.pagination.hasMore
            : null;
        const moreAvailable =
          reachedEnd
            ? false
            : hasMoreValue !== null
            ? hasMoreValue
            : totalCountFromPayload !== null
            ? updatedVideos.length < totalCountFromPayload
            : Boolean(newCursor) && normalized.length > 0;

        setHasMore(moreAvailable);
        setNextCursor(moreAvailable ? newCursor : null);
      } catch (fetchError) {
        if (!isMountedRef.current) {
          pendingCursorRef.current = null;
          return;
        }

        if (cursor) {
          if (isBackgroundFetch) {
            console.error('Failed to prefetch videos:', fetchError);
          } else {
            setLoadMoreError(
              fetchError instanceof Error
                ? fetchError.message
                : 'Failed to load more videos'
            );
            setHasMore(false);
          }
        } else if (isBackgroundFetch) {
          console.error('Failed to refresh videos:', fetchError);
        } else {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load videos'
          );
          setVideos([]);
          setHasMore(false);
        }
      } finally {
        if (!isMountedRef.current) {
          pendingCursorRef.current = null;
          return;
        }

        if (cursor) {
          if (!isBackgroundFetch) {
            setIsFetchingMore(false);
          }
        } else if (!isBackgroundFetch) {
          setIsLoading(false);
        }
        pendingCursorRef.current = null;
      }
    },
    []
  );

  const ensureCommentsLoaded = useCallback(
    async (videoId: string) => {
      const current =
        commentsMapRef.current[videoId] ?? createInitialCommentState();
      if (current.hasLoadedInitial || current.isLoading) {
        return;
      }

      setCommentsMap((previous) => {
        const previousState =
          previous[videoId] ?? createInitialCommentState();
        const nextState: VideoCommentState = {
          ...previousState,
          isLoading: true,
          error: null
        };
        const next = {
          ...previous,
          [videoId]: nextState
        };
        commentsMapRef.current = next;
        return next;
      });

      try {
        const response = await fetch(
          `/api/videos/${videoId}/comments?limit=20`,
          {
            method: 'GET',
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          let message = 'We could not load comments right now.';
          try {
            const errorPayload = await response.json();
            if (
              errorPayload &&
              typeof errorPayload === 'object' &&
              'error' in errorPayload &&
              typeof (errorPayload as { error?: unknown }).error === 'string'
            ) {
              message =
                ((errorPayload as { error?: string }).error ?? '').trim() ||
                message;
            }
          } catch {
            const fallback = await response.text();
            if (fallback.trim()) {
              message = fallback.trim();
            }
          }
          throw new Error(message);
        }

        const payload = await response.json();
        if (
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof (payload as { error?: unknown }).error === 'string'
        ) {
          throw new Error(
            (payload as { error?: string }).error ||
              'Failed to load comments.'
          );
        }

        const {
          items: normalized,
          nextCursor,
          hasMore
        } = coerceCommentsPayload(payload);

        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            items: normalized,
            nextCursor,
            hasMore,
            isLoading: false,
            error: null,
            hasLoadedInitial: true
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load comments.';
        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            isLoading: false,
            error: message,
            hasLoadedInitial: true
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });
      }
    },
    []
  );

  const loadMoreComments = useCallback(
    async (videoId: string) => {
      const current =
        commentsMapRef.current[videoId] ?? createInitialCommentState();
      if (!current.hasMore || current.isLoading) {
        return;
      }

      setCommentsMap((previous) => {
        const previousState =
          previous[videoId] ?? createInitialCommentState();
        const nextState: VideoCommentState = {
          ...previousState,
          isLoading: true,
          error: null
        };
        const next = {
          ...previous,
          [videoId]: nextState
        };
        commentsMapRef.current = next;
        return next;
      });

      try {
        const params = new URLSearchParams({ limit: '20' });
        if (current.nextCursor) {
          params.set('cursor', current.nextCursor);
        }

        const response = await fetch(
          `/api/videos/${videoId}/comments?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          let message = 'We could not load more comments.';
          try {
            const errorPayload = await response.json();
            if (
              errorPayload &&
              typeof errorPayload === 'object' &&
              'error' in errorPayload &&
              typeof (errorPayload as { error?: unknown }).error === 'string'
            ) {
              message =
                ((errorPayload as { error?: string }).error ?? '').trim() ||
                message;
            }
          } catch {
            const fallback = await response.text();
            if (fallback.trim()) {
              message = fallback.trim();
            }
          }
          throw new Error(message);
        }

        const payload = await response.json();
        if (
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof (payload as { error?: unknown }).error === 'string'
        ) {
          throw new Error(
            (payload as { error?: string }).error ||
              'Failed to load comments.'
          );
        }

        const {
          items: normalized,
          nextCursor,
          hasMore
        } = coerceCommentsPayload(payload);

        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            items: [...previousState.items, ...normalized],
            nextCursor,
            hasMore,
            isLoading: false,
            error: null
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load comments.';
        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            isLoading: false,
            error: message
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });
      }
    },
    []
  );

  const fetchSingleVideo = useCallback(
    async (videoId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/videos/${videoId}`, {
          method: 'GET',
          cache: 'no-store'
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to load video.');
        }

        const payload = await response.json();
        const candidate =
          payload && typeof payload === 'object' && 'publication' in payload
            ? (payload as { publication: unknown }).publication
            : payload;

        const normalized = normalizeVideo(candidate);
        if (!normalized) {
          throw new Error('Video not found.');
        }

        setVideos((previous) => {
          const filtered = previous.filter((video) => video.id !== normalized.id);
          return [normalized, ...filtered];
        });

        setError(null);
        void ensureCommentsLoaded(videoId);
      } catch (singleError) {
        if (!isMountedRef.current) {
          return;
        }

        const message =
          singleError instanceof Error
            ? singleError.message
            : 'Failed to load video.';
        setError(message);
        setVideos([]);
      } finally {
        if (!isMountedRef.current) {
          return;
        }
        setIsLoading(false);
      }
    },
    [ensureCommentsLoaded]
  );

  const submitComment = useCallback(
    async (videoId: string, text: string) => {
      setCommentsMap((previous) => {
        const previousState =
          previous[videoId] ?? createInitialCommentState();
        const nextState: VideoCommentState = {
          ...previousState,
          isPosting: true,
          error: null
        };
        const next = {
          ...previous,
          [videoId]: nextState
        };
        commentsMapRef.current = next;
        return next;
      });

      try {
        const response = await fetch(
          `/api/videos/${videoId}/comments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify({ text })
          }
        );

        if (!response.ok) {
          let errorMessage =
            'We could not post your comment. Please try again in a moment.';
          let errorPayload: unknown;

          try {
            errorPayload = await response.json();
          } catch {
            const fallbackText = await response.text();
            if (fallbackText.trim()) {
              errorMessage = fallbackText.trim();
            }
          }

          if (errorPayload && typeof errorPayload === 'object') {
            const candidate =
              (errorPayload as { error?: unknown }).error ?? errorPayload;
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
              errorMessage = candidate.trim();
            }
          }

          if (response.status === 401) {
            errorMessage = 'Sign in to join the conversation.';
            promptLogin(errorMessage);
          }

          throw new Error(errorMessage);
        }

        const payload = await response.json();
        const newComment = normalizeComment(
          payload && typeof payload === 'object' && 'comment' in payload
            ? (payload as { comment: unknown }).comment
            : payload
        );
        if (!newComment) {
          throw new Error('Invalid comment response.');
        }

        const statsPayload = payload?.stats as Partial<VideoStats> | undefined;

        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            items: [newComment, ...previousState.items],
            isPosting: false,
            error: null
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });

        updateVideo(videoId, (previous) => ({
          ...previous,
          stats: {
            likes:
              typeof statsPayload?.likes === 'number'
                ? statsPayload.likes
                : previous.stats.likes,
            comments:
              typeof statsPayload?.comments === 'number'
                ? statsPayload.comments
                : previous.stats.comments + 1,
            shares:
              typeof statsPayload?.shares === 'number'
                ? statsPayload.shares
                : previous.stats.shares
          }
        }));
      } catch (submitError) {
        const message =
          submitError instanceof Error
            ? submitError.message
            : 'Failed to post comment.';
        setCommentsMap((previous) => {
          const previousState =
            previous[videoId] ?? createInitialCommentState();
          const nextState: VideoCommentState = {
            ...previousState,
            isPosting: false,
            error: message
          };
          const next = {
            ...previous,
            [videoId]: nextState
          };
          commentsMapRef.current = next;
          return next;
        });

        throw new Error(message);
      }
    },
    [promptLogin, updateVideo]
  );

  const toggleLike = useCallback(
    async (videoId: string) => {
      const target = videos.find((video) => video.id === videoId);
      if (!target) {
        return;
      }

      updateInteractionState(videoId, { liking: true });

      const optimisticLiked = !target.viewerHasLiked;
      const optimisticLikes = Math.max(
        0,
        target.stats.likes + (optimisticLiked ? 1 : -1)
      );

      updateVideo(videoId, (previous) => ({
        ...previous,
        viewerHasLiked: optimisticLiked,
        stats: {
          ...previous.stats,
          likes: optimisticLikes
        }
      }));

      let unauthorized = false;

      try {
        const response = await fetch(
          `/api/videos/${videoId}/like`,
          {
            method: 'POST',
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            unauthorized = true;
            promptLogin('Log in to like videos.');
          }
          const message = await response.text();
          throw new Error(message || 'Failed to update like.');
        }

        const payload = await response.json();
        const liked =
          typeof payload?.liked === 'boolean'
            ? payload.liked
            : optimisticLiked;
        const statsPayload = payload?.stats as Partial<VideoStats> | undefined;

        updateVideo(videoId, (previous) => ({
          ...previous,
          viewerHasLiked: liked,
          stats: {
            likes:
              typeof statsPayload?.likes === 'number'
                ? statsPayload.likes
                : previous.stats.likes,
            comments:
              typeof statsPayload?.comments === 'number'
                ? statsPayload.comments
                : previous.stats.comments,
            shares:
              typeof statsPayload?.shares === 'number'
                ? statsPayload.shares
                : previous.stats.shares
          }
        }));
      } catch (likeError) {
        updateVideo(videoId, () => ({ ...target }));

        if (!unauthorized) {
          const message =
            likeError instanceof Error
              ? likeError.message
              : 'Failed to update like.';
          setAuthNotice(message);
        }
      } finally {
        updateInteractionState(videoId, { liking: false });
      }
    },
    [promptLogin, updateInteractionState, updateVideo, videos]
  );

  const shareVideo = useCallback(
    async (video: PublishedVideo) => {
      updateInteractionState(video.id, { sharing: true });

      const shareUrl = getShareUrl(video);
      let shared = false;
      let unauthorized = false;

      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share({
              title: video.title,
              url: shareUrl
            });
            shared = true;
          } catch (shareError) {
            if (
              shareError instanceof Error &&
              (shareError.name === 'AbortError' ||
                shareError.message === 'Share canceled')
            ) {
              return;
            }
            throw shareError;
          }
        } else if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard
        ) {
          await navigator.clipboard.writeText(shareUrl);
          setToast('Link copied to clipboard.');
          shared = true;
        } else {
          setToast(`Share link: ${shareUrl}`);
          shared = true;
        }

        if (!shared) {
          return;
        }

        const response = await fetch(
          `/api/videos/${video.id}/share`,
          {
            method: 'POST',
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            unauthorized = true;
            promptLogin('Log in to share videos.');
          }
          const message = await response.text();
          throw new Error(message || 'Failed to record share.');
        }

        const payload = await response.json();
        const statsPayload = payload?.stats as Partial<VideoStats> | undefined;

        updateVideo(video.id, (previous) => ({
          ...previous,
          stats: {
            likes:
              typeof statsPayload?.likes === 'number'
                ? statsPayload.likes
                : previous.stats.likes,
            comments:
              typeof statsPayload?.comments === 'number'
                ? statsPayload.comments
                : previous.stats.comments,
            shares:
              typeof statsPayload?.shares === 'number'
                ? statsPayload.shares
                : previous.stats.shares + 1
          }
        }));
      } catch (shareError) {
        if (!shared || !unauthorized) {
          const message =
            shareError instanceof Error
              ? shareError.message
              : 'Failed to record share.';
          setAuthNotice(message);
        }
      } finally {
        updateInteractionState(video.id, { sharing: false });
      }
    },
    [promptLogin, updateInteractionState, updateVideo]
  );

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

  const clearDesktopControlsTimeout = useCallback(() => {
    if (desktopControlsTimeoutRef.current) {
      clearTimeout(desktopControlsTimeoutRef.current);
      desktopControlsTimeoutRef.current = null;
    }
  }, []);

  const showDesktopControls = useCallback(() => {
    setDesktopControlsVisible(true);
    clearDesktopControlsTimeout();
    desktopControlsTimeoutRef.current = setTimeout(() => {
      setDesktopControlsVisible(false);
      desktopControlsTimeoutRef.current = null;
    }, DESKTOP_CONTROLS_HIDE_DELAY);
  }, [clearDesktopControlsTimeout]);

  const revealDesktopControls = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (isMobile) {
        return;
      }

      const target = event?.target;
      if (
        target instanceof HTMLElement &&
        target.closest('.comment-drawer')
      ) {
        return;
      }

      showDesktopControls();
    },
    [isMobile, showDesktopControls]
  );

  const selectAspectFilter = useCallback((nextFilter: GalleryAspectFilter) => {
    userSelectedAspectRef.current = true;
    setAspectFilter(nextFilter);
  }, []);

  const persistDisplayModePreference = useCallback(
    (nextMode: GalleryDisplayMode) => {
      if (typeof window === 'undefined') {
        return;
      }

      const storages: Storage[] = [];

      try {
        if ('localStorage' in window && window.localStorage) {
          storages.push(window.localStorage);
        }
      } catch {
        // localStorage might be unavailable (e.g., private browsing). Ignore.
      }

      try {
        if ('sessionStorage' in window && window.sessionStorage) {
          storages.push(window.sessionStorage);
        }
      } catch {
        // sessionStorage might be unavailable (e.g., private browsing). Ignore.
      }

      storages.forEach((storage) => {
        try {
          storage.setItem(DISPLAY_MODE_STORAGE_KEY, nextMode);
        } catch {
          // Storage writes might fail (e.g., quota exceeded). Ignore.
        }
      });
    },
    []
  );

  const selectDisplayMode = useCallback(
    (nextMode: GalleryDisplayMode) => {
      setDisplayMode(nextMode);
      persistDisplayModePreference(nextMode);
    },
    [persistDisplayModePreference]
  );

  const selectVisibleVideo = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      if (visibleVideos.length === 0) {
        return;
      }

      const nextIndex = (index + visibleVideos.length) % visibleVideos.length;
      const nextVideo = visibleVideos[nextIndex];
      setActiveFeedIndex(nextIndex);

      if (!nextVideo) {
        return;
      }

      setVideoBuffering(nextVideo.id, true);
      clearVideoPlaybackError(nextVideo.id);

      if (isMobile) {
        setDisplayMode('feed');
        setIsMobileAutoplayEnabled(true);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            feedItemRefs.current[nextIndex]?.scrollIntoView({
              behavior,
              block: 'start'
            });
          });
        });
        return;
      }

      setSelectedVideoId(nextVideo.id);
      setIsDesktopPlaying(true);
      setDisplayMode('feed');
      showDesktopControls();
    },
    [
      clearVideoPlaybackError,
      isMobile,
      setVideoBuffering,
      showDesktopControls,
      visibleVideos
    ]
  );

  const changeDesktopVolume = useCallback((nextValue: number) => {
    const normalized = clampVolume(nextValue);
    setDesktopVolume(normalized);
    setDesktopMuted(normalized <= MIN_AUDIBLE_VOLUME);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (
      typeof window !== 'undefined' &&
      !('IntersectionObserver' in window)
    ) {
      setSupportsIntersectionObserver(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setActiveFeedIndex(0);
    setCommentPanelVideoId(null);
    clearScheduledAutoplayRaise();

    if (galleryViewMode === 'mobile') {
      setSelectedVideoId(null);
      return;
    }

    if (visibleVideos[0]) {
      setSelectedVideoId((current) => current ?? visibleVideos[0].id);
    }
  }, [clearScheduledAutoplayRaise, galleryViewMode]);

  useEffect(() => {
    if (userSelectedAspectRef.current) {
      return;
    }

    setAspectFilter(isMobile ? 'portrait' : 'landscape');
  }, [isMobile]);

  useEffect(() => {
    setActiveFeedIndex((currentIndex) => {
      if (visibleVideos.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, visibleVideos.length - 1);
    });
  }, [visibleVideos.length]);

  useEffect(() => {
    if (!selectedVideoId || isMobile) {
      return;
    }

    const selectedIndex = visibleVideos.findIndex(
      (video) => video.id === selectedVideoId
    );
    if (selectedIndex === -1) {
      if (visibleVideos[0]) {
        setSelectedVideoId(visibleVideos[0].id);
        setActiveFeedIndex(0);
      }
      return;
    }

    setActiveFeedIndex(selectedIndex);
  }, [isMobile, selectedVideoId, visibleVideos]);

  useEffect(() => {
    if (visibleVideos.length === 0) {
      setActiveFeedIndex(0);
      return;
    }

    if (activeFeedIndex >= visibleVideos.length) {
      setActiveFeedIndex(0);
    }
  }, [activeFeedIndex, visibleVideos.length]);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const activeId = activeVisibleVideo?.id;
    const effectiveMuted =
      desktopMuted || desktopVolume <= MIN_AUDIBLE_VOLUME;
    const resolvedVolume = effectiveMuted ? 0 : clampVolume(desktopVolume);

    Object.entries(desktopVideoRefs.current).forEach(([videoId, element]) => {
      if (!(element instanceof HTMLVideoElement)) {
        return;
      }

      const isActive = videoId === activeId;

      try {
        element.muted = effectiveMuted;
        element.volume = resolvedVolume;
      } catch {
        // Ignore setter failures on unsupported browsers.
      }

      if (isActive && isDesktopPlaying && displayMode === 'feed') {
        element.preload = 'auto';
        if (element.networkState === MEDIA_NETWORK_EMPTY) {
          try {
            element.load();
          } catch {
            // Ignore load failures; the media element will surface an error event.
          }
        }

        if (element.readyState < MEDIA_HAVE_CURRENT_DATA) {
          setVideoBuffering(videoId, true);
        }

        if (element.ended) {
          element.currentTime = 0;
        }
        void element.play().catch((playError: unknown) => {
          if (
            playError instanceof DOMException &&
            playError.name === 'NotAllowedError'
          ) {
            setIsDesktopPlaying(false);
            setVideoBuffering(videoId, false);
            return;
          }

          const message =
            playError instanceof Error && playError.message
              ? playError.message
              : 'This video could not be played.';
          setVideoPlaybackError(videoId, message);
        });
        return;
      }

      element.pause();
    });
  }, [
    activeVisibleVideo?.id,
    displayMode,
    desktopMuted,
    desktopVolume,
    isDesktopPlaying,
    isMobile,
    setVideoBuffering,
    setVideoPlaybackError,
    visibleVideos.length
  ]);

  useEffect(
    () => () => {
      clearDesktopControlsTimeout();
    },
    [clearDesktopControlsTimeout]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      setInitialVideoId(null);
      return;
    }

    const url = new URL(window.location.href);
    const videoIdParam = url.searchParams.get('videoId');
    setInitialVideoId(videoIdParam);

    if (!videoIdParam) {
      return;
    }

    const currentlyMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (currentlyMobile) {
      setPendingMobileVideoId(videoIdParam);
    } else {
      setSelectedVideoId(videoIdParam);
    }
  }, []);

  useEffect(() => {
    if (!isMobile || !pendingMobileVideoId) {
      return;
    }

    const index = visibleVideos.findIndex(
      (video) => video.id === pendingMobileVideoId
    );
    if (index === -1) {
      return;
    }

    setActiveFeedIndex(index);

    if (typeof window === 'undefined') {
      setPendingMobileVideoId(null);
      return;
    }

    const attemptScroll = () => {
      const element = feedItemRefs.current[index];
      if (!element || typeof element.scrollIntoView !== 'function') {
        return false;
      }

      element.scrollIntoView({ behavior: 'auto', block: 'start' });
      return true;
    };

    if (attemptScroll()) {
      setPendingMobileVideoId(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      attemptScroll();
      setPendingMobileVideoId(null);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isMobile, pendingMobileVideoId, visibleVideos]);

  useEffect(() => {
    if (initialVideoId === undefined) {
      return;
    }

    if (hasBootstrappedRef.current) {
      return;
    }
    hasBootstrappedRef.current = true;

    if (initialVideoId) {
      void (async () => {
        try {
          await fetchSingleVideo(initialVideoId);
        } finally {
          fetchVideos(undefined, { background: true });
        }
      })();
    } else {
      fetchVideos();
    }
  }, [fetchSingleVideo, fetchVideos, initialVideoId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateBreakpoint = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  useEffect(() => {
    if (
      !isMobile ||
      initialMobilePrefetchRequestedRef.current ||
      isLoading ||
      isFetchingMore ||
      loadMoreError ||
      !videos.length ||
      !hasMore ||
      !nextCursor ||
      pendingCursorRef.current
    ) {
      return;
    }

    initialMobilePrefetchRequestedRef.current = true;
    fetchVideos(nextCursor, { background: true });
  }, [
    fetchVideos,
    hasMore,
    isFetchingMore,
    isLoading,
    isMobile,
    loadMoreError,
    nextCursor,
    videos.length
  ]);

  useEffect(() => {
    if (
      !isMobile ||
      !hasMore ||
      !nextCursor ||
      isLoading ||
      isFetchingMore ||
      loadMoreError ||
      pendingCursorRef.current
    ) {
      return;
    }

    if (videos.length === 0) {
      return;
    }

    const remaining = visibleVideos.length - 1 - activeFeedIndex;
    if (remaining > MOBILE_PREFETCH_THRESHOLD) {
      return;
    }

    fetchVideos(nextCursor, { background: true });
  }, [
    activeFeedIndex,
    fetchVideos,
    hasMore,
    isFetchingMore,
    isLoading,
    isMobile,
    loadMoreError,
    nextCursor,
    videos,
    visibleVideos.length
  ]);

  useEffect(() => {
    if (
      isMobile ||
      !hasMore ||
      !nextCursor ||
      isLoading ||
      isFetchingMore ||
      loadMoreError ||
      pendingCursorRef.current ||
      visibleVideos.length === 0
    ) {
      return;
    }

    const remaining = visibleVideos.length - 1 - activeFeedIndex;
    if (remaining > MOBILE_PREFETCH_THRESHOLD) {
      return;
    }

    fetchVideos(nextCursor, { background: true });
  }, [
    activeFeedIndex,
    fetchVideos,
    hasMore,
    isFetchingMore,
    isLoading,
    isMobile,
    loadMoreError,
    nextCursor,
    visibleVideos.length
  ]);

  useEffect(() => {
    if (!isMobile || displayMode !== 'feed' || visibleVideos.length === 0) {
      return;
    }

    const startIndex = Math.max(0, activeFeedIndex - MOBILE_PRELOAD_BEHIND);
    const endIndex = Math.min(
      videos.length - 1,
      activeFeedIndex + MOBILE_PRELOAD_AHEAD
    );

    for (let index = startIndex; index <= endIndex; index += 1) {
      if (index === activeFeedIndex) {
        continue;
      }

      prefetchMobileVideoAt(index);
    }
  }, [
    activeFeedIndex,
    displayMode,
    isMobile,
    prefetchMobileVideoAt,
    visibleVideos.length
  ]);

  useEffect(() => {
    feedItemRefs.current = feedItemRefs.current.slice(0, visibleVideos.length);

    if (!isMobile || displayMode !== 'feed' || !supportsIntersectionObserver) {
      return;
    }

    const elements = feedItemRefs.current.filter(
      (element): element is HTMLDivElement => Boolean(element)
    );
    if (elements.length === 0) {
      return;
    }

    const rootElement = mobileFeedRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const indexValue = Number(entry.target.getAttribute('data-index'));
          if (Number.isNaN(indexValue)) {
            return;
          }

          setActiveFeedIndex(indexValue);
          ensureMobileVideoPlaying(indexValue);

          const remaining = visibleVideos.length - indexValue - 1;
          if (
            hasMore &&
            nextCursor &&
            remaining <= MOBILE_PREFETCH_THRESHOLD &&
            !isLoading &&
            !isFetchingMore &&
            !pendingCursorRef.current &&
            !loadMoreError
          ) {
            fetchVideos(nextCursor);
          }
        });
      },
      {
        root: rootElement ?? null,
        threshold: 0.6
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, [
    fetchVideos,
    hasMore,
    ensureMobileVideoPlaying,
    displayMode,
    isFetchingMore,
    isLoading,
    isMobile,
    loadMoreError,
    nextCursor,
    supportsIntersectionObserver,
    visibleVideos
  ]);

  useEffect(() => {
    if (!isMobile || displayMode !== 'feed') {
      return;
    }

    const feed = mobileFeedRef.current;
    if (!feed) {
      return;
    }

    const touchOptions: AddEventListenerOptions = { passive: true };
    const handleGesture = () => {
      resumeAutoplayFromGesture();
    };

    const handleScroll = () => {
      scheduleMobileActiveEvaluation();
    };

    const handleResize = () => {
      scheduleMobileActiveEvaluation();
    };

    scheduleMobileActiveEvaluation();

    feed.addEventListener('pointerup', handleGesture);
    feed.addEventListener('pointercancel', handleGesture);
    feed.addEventListener('touchend', handleGesture, touchOptions);
    feed.addEventListener('scroll', handleScroll, { passive: true });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      feed.removeEventListener('pointerup', handleGesture);
      feed.removeEventListener('pointercancel', handleGesture);
      feed.removeEventListener('touchend', handleGesture, touchOptions);
      feed.removeEventListener('scroll', handleScroll);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [
    displayMode,
    isMobile,
    resumeAutoplayFromGesture,
    scheduleMobileActiveEvaluation
  ]);

  useEffect(() => {
    if (!isMobile || displayMode !== 'feed') {
      return;
    }

    scheduleMobileActiveEvaluation();
    ensureMobileVideoPlaying(activeFeedIndex);
  }, [
    activeFeedIndex,
    displayMode,
    ensureMobileVideoPlaying,
    isMobile,
    scheduleMobileActiveEvaluation,
    videos.length
  ]);

  useEffect(
    () => () => {
      if (
        typeof window !== 'undefined' &&
        mobileActiveRafRef.current !== null
      ) {
        window.cancelAnimationFrame(mobileActiveRafRef.current);
        mobileActiveRafRef.current = null;
      }
      clearScheduledAutoplayRaise();
    },
    [clearScheduledAutoplayRaise]
  );

  useEffect(() => {
    if (!isMobile) {
      if (
        typeof window !== 'undefined' &&
        mobileActiveRafRef.current !== null
      ) {
        window.cancelAnimationFrame(mobileActiveRafRef.current);
        mobileActiveRafRef.current = null;
      }
      clearScheduledAutoplayRaise();
      return;
    }

    feedItemRefs.current.forEach((element, index) => {
      const videoElement = element?.querySelector('video') as
        | HTMLVideoElement
        | null;
      if (!videoElement) {
        return;
      }

      if (index !== activeFeedIndex) {
        try {
          videoElement.muted = true;
          videoElement.volume = 0;
        } catch {
          // Ignore setter failures on unsupported browsers.
        }

        if (!videoElement.paused) {
          videoElement.pause();
        }
      }
    });

    ensureMobileVideoPlaying(activeFeedIndex);
  }, [
    activeFeedIndex,
    clearScheduledAutoplayRaise,
    ensureMobileVideoPlaying,
    isMobile,
    videos.length
  ]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    if (!mobileMuted && mobileVolume > MIN_AUDIBLE_VOLUME) {
      return;
    }

    clearScheduledAutoplayRaise();

    const activeElement =
      feedItemRefs.current[activeFeedIndex]?.querySelector('video');
    if (activeElement instanceof HTMLVideoElement) {
      try {
        activeElement.muted = true;
        activeElement.volume = 0;
      } catch {
        // Ignore setter failures on unsupported browsers.
      }
    }
  }, [
    activeFeedIndex,
    clearScheduledAutoplayRaise,
    isMobile,
    mobileMuted,
    mobileVolume
  ]);

  useEffect(() => {
    if (!isMobile) {
      setShowMobileVolume(false);
      adjustingVolumeRef.current = false;
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    setShowMobileVolume(false);
    clearVolumeOverlayTimeout();
    adjustingVolumeRef.current = false;
  }, [activeFeedIndex, clearVolumeOverlayTimeout, isMobile]);

  useEffect(() => {
    if (!authNotice) {
      return;
    }

    if (authNoticeTimeoutRef.current) {
      clearTimeout(authNoticeTimeoutRef.current);
    }

    authNoticeTimeoutRef.current = setTimeout(() => {
      setAuthNotice(null);
      authNoticeTimeoutRef.current = null;
    }, 3200);

    return () => {
      if (authNoticeTimeoutRef.current) {
        clearTimeout(authNoticeTimeoutRef.current);
        authNoticeTimeoutRef.current = null;
      }
    };
  }, [authNotice]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2400);

    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, [toast]);

  useEffect(
    () => () => {
      if (authNoticeTimeoutRef.current) {
        clearTimeout(authNoticeTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    []
  );

  useEffect(
    () => () => {
      clearVolumeOverlayTimeout();
    },
    [clearVolumeOverlayTimeout]
  );

  useEffect(() => {
    if (isMobile && selectedVideoId) {
      setSelectedVideoId(null);
    }
  }, [isMobile, selectedVideoId]);

  useEffect(() => {
    if (!commentPanelVideoId) {
      return;
    }

    void ensureCommentsLoaded(commentPanelVideoId);
  }, [commentPanelVideoId, ensureCommentsLoaded]);

  useEffect(() => {
    if (!selectedVideoId) {
      return;
    }

    void ensureCommentsLoaded(selectedVideoId);
  }, [selectedVideoId, ensureCommentsLoaded]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (commentPanelVideoId) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }

    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [commentPanelVideoId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const activeVideoId =
      selectedVideoId ?? (isMobile ? commentPanelVideoId : null) ?? null;

    const url = new URL(window.location.href);
    if (activeVideoId) {
      url.searchParams.set('videoId', activeVideoId);
    } else {
      url.searchParams.delete('videoId');
    }

    const updated = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', updated);
  }, [commentPanelVideoId, isMobile, selectedVideoId]);

  const videoById = useMemo(() => {
    return new Map(videos.map((video) => [video.id, video]));
  }, [videos]);

  const commentPanelVideo =
    commentPanelVideoId ? videoById.get(commentPanelVideoId) ?? null : null;
  const commentPanelState =
    commentPanelVideoId && commentsMap[commentPanelVideoId]
      ? commentsMap[commentPanelVideoId]
      : createInitialCommentState();

  const placeholderItems = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => (
        <div
          className="video-card video-card--placeholder"
          key={`placeholder-${index}`}
        >
          <div className="video-card__media skeleton" />
          <div className="video-card__content">
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text skeleton--text-short" />
            <div className="skeleton skeleton--text skeleton--text-faint" />
          </div>
        </div>
      )),
    []
  );

  const showSkeleton = isLoading;

  const isVolumeEffectivelyMuted =
    mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
  const volumePercent = Math.round(mobileVolume * 100);
  const volumeValueText = isVolumeEffectivelyMuted
    ? 'Muted'
    : `${volumePercent}%`;
  const volumeIcon = isVolumeEffectivelyMuted
    ? '🔇'
    : mobileVolume < 0.4
    ? '🔈'
    : mobileVolume < 0.75
    ? '🔉'
    : '🔊';
  const volumeSliderClassName = showMobileVolume
    ? `${volumeStyles.slider} ${volumeStyles.sliderVisible}`
    : volumeStyles.slider;

  const desktopVolumePercent = Math.round(desktopVolume * 100);
  const isDesktopEffectivelyMuted =
    desktopMuted || desktopVolume <= MIN_AUDIBLE_VOLUME;
  const visibleFormatLabel = aspectFilter === 'portrait' ? 'portrait' : 'landscape';
  const feedModeLabel = displayMode === 'feed' ? 'Feed view' : 'Grid view';

  const renderGalleryTopbar = () => (
    <header
      className="gallery-feed-topbar"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="gallery-feed-heading">
        <span>T2V Gallery</span>
        <strong>{feedModeLabel}</strong>
      </div>

      <div className="gallery-feed-toolbar" aria-label="Gallery view controls">
        <button
          type="button"
          className={`gallery-toolbar-button${
            displayMode === 'feed' ? ' gallery-toolbar-button--active' : ''
          }`}
          onClick={() => selectDisplayMode('feed')}
          title="Feed view"
        >
          Feed
        </button>
        <button
          type="button"
          className={`gallery-toolbar-button${
            displayMode === 'grid' ? ' gallery-toolbar-button--active' : ''
          }`}
          onClick={() => selectDisplayMode('grid')}
          title="Grid view"
        >
          Grid
        </button>
        <span className="gallery-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={`gallery-toolbar-button${
            aspectFilter === 'landscape' ? ' gallery-toolbar-button--active' : ''
          }`}
          onClick={() => selectAspectFilter('landscape')}
          title="Show landscape videos"
        >
          16:9
        </button>
        <button
          type="button"
          className={`gallery-toolbar-button${
            aspectFilter === 'portrait' ? ' gallery-toolbar-button--active' : ''
          }`}
          onClick={() => selectAspectFilter('portrait')}
          title="Show portrait videos"
        >
          9:16
        </button>
      </div>
    </header>
  );

  const renderDesktopStage = () => {
    if (!activeVisibleVideo) {
      return null;
    }

    const activeInteraction =
      interactionMap[activeVisibleVideo.id] ?? DEFAULT_INTERACTION_STATE;
    const activeCreator = activeVisibleVideo.creatorHandle
      ? `@${activeVisibleVideo.creatorHandle}${
          activeVisibleVideo.isBotUser ? ' [bot]' : ''
        }`
      : 'Published video';
    const stageClassName = [
      'desktop-gallery-layout',
      desktopControlsVisible || commentPanelVideoId === activeVisibleVideo.id
        ? 'desktop-gallery-layout--controls-visible'
        : ''
    ]
      .filter(Boolean)
      .join(' ');
    const activePlaybackError = videoPlaybackErrors[activeVisibleVideo.id];
    const activeVideoIsBuffering =
      isDesktopPlaying &&
      !activePlaybackError &&
      (bufferingVideoIds[activeVisibleVideo.id] ?? true);

    return (
      <section
        className={stageClassName}
        onPointerDown={revealDesktopControls}
        onPointerMove={revealDesktopControls}
      >
        <div className="desktop-gallery-stage">
          {visibleVideos.map((video, index) => {
            const isActive = index === activeFeedIndex;
            const aspectLayout = getAspectRatioLayout(video.aspectRatio);

            return (
              <article
                className={`desktop-gallery-card${
                  isActive ? ' desktop-gallery-card--active' : ''
                }`}
                key={video.id}
              >
                <video
	                  ref={(element) => {
	                    desktopVideoRefs.current[video.id] = element;
	                  }}
                  data-video-id={video.id}
	                  src={video.videoUrl}
                  poster={video.posterUrl}
	                  className={`gallery-feed-video gallery-feed-video--${aspectLayout}`}
	                  muted={isDesktopEffectivelyMuted}
	                  playsInline
	                  preload={isActive ? 'auto' : 'none'}
	                  autoPlay={isActive && isDesktopPlaying}
	                  loop={false}
	                  onEnded={() => selectVisibleVideo(index + 1)}
                  onLoadStart={() => {
                    if (isActive) {
                      setVideoBuffering(video.id, true);
                    }
                  }}
	                  onLoadedMetadata={(event) =>
	                    handleDesktopVideoLoadedMetadata(video.id, event)
	                  }
                  onLoadedData={(event) =>
                    handleDesktopVideoReady(video.id, isActive, event)
                  }
                  onCanPlay={(event) =>
                    handleDesktopVideoReady(video.id, isActive, event)
                  }
                  onPlaying={() => handleVideoPlaying(video.id)}
                  onWaiting={(event) => handleVideoWaiting(video.id, event)}
                  onStalled={() => handleVideoStalled(video.id)}
                  onError={(event) => handleVideoError(video.id, event)}
	                />
	              </article>
	            );
	          })}

          {activePlaybackError ? (
            <div className="gallery-video-status gallery-video-status--error" role="alert">
              <strong>Video unavailable</strong>
              <span>{activePlaybackError}</span>
            </div>
          ) : activeVideoIsBuffering ? (
            <div className="gallery-video-status" role="status" aria-live="polite">
              <span className="gallery-video-status__spinner" aria-hidden="true" />
              <span>Loading video…</span>
            </div>
          ) : null}

          <div
            className="desktop-gallery-ui"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="gallery-feed-meta">
              <div className="gallery-feed-author">{activeCreator}</div>
              <h2 title={activeVisibleVideo.title}>{activeVisibleVideo.title}</h2>
              {activeVisibleVideo.description && (
                <p>{activeVisibleVideo.description}</p>
              )}
            </div>

            <div className="desktop-gallery-actions">
              <button
                type="button"
                className="gallery-icon-button"
                onClick={() => setIsDesktopPlaying((current) => !current)}
                title={isDesktopPlaying ? 'Pause' : 'Play'}
                aria-label={isDesktopPlaying ? 'Pause video' : 'Play video'}
              >
                <span aria-hidden="true">{isDesktopPlaying ? 'Ⅱ' : '▶'}</span>
              </button>
              <button
                type="button"
                className="gallery-icon-button"
                onClick={() => setDesktopMuted((current) => !current)}
                title={isDesktopEffectivelyMuted ? 'Unmute' : 'Mute'}
                aria-label={isDesktopEffectivelyMuted ? 'Unmute' : 'Mute'}
              >
                <span aria-hidden="true">
                  {isDesktopEffectivelyMuted ? '🔇' : '🔊'}
                </span>
              </button>
              <label className="desktop-gallery-volume" title="Volume">
                <input
                  aria-label="Volume"
                  max="100"
                  min="0"
                  type="range"
                  value={
                    isDesktopEffectivelyMuted ? 0 : desktopVolumePercent
                  }
                  onChange={(event) =>
                    changeDesktopVolume(Number(event.target.value) / 100)
                  }
                />
              </label>
              <button
                type="button"
                className={`gallery-icon-button${
                  activeVisibleVideo.viewerHasLiked
                    ? ' gallery-icon-button--active'
                    : ''
                }`}
                onClick={() => toggleLike(activeVisibleVideo.id)}
                disabled={activeInteraction.liking}
                title={
                  activeVisibleVideo.viewerHasLiked ? 'Unlike' : 'Like'
                }
                aria-label={
                  activeVisibleVideo.viewerHasLiked ? 'Unlike' : 'Like'
                }
              >
                <span aria-hidden="true">♥</span>
                <span>{activeVisibleVideo.stats.likes.toLocaleString()}</span>
              </button>
              <button
                type="button"
                className="gallery-icon-button"
                onClick={() => {
                  setCommentPanelVideoId(activeVisibleVideo.id);
                  void ensureCommentsLoaded(activeVisibleVideo.id);
                }}
                title="Comments"
                aria-label="Open comments"
              >
                <span aria-hidden="true">💬</span>
                <span>
                  {activeVisibleVideo.stats.comments.toLocaleString()}
                </span>
              </button>
              <button
                type="button"
                className="gallery-icon-button"
                onClick={() => shareVideo(activeVisibleVideo)}
                disabled={activeInteraction.sharing}
                title="Share"
                aria-label="Share video"
              >
                <span aria-hidden="true">⤴</span>
                <span>{activeVisibleVideo.stats.shares.toLocaleString()}</span>
              </button>
            </div>

            <div className="gallery-feed-timeline" aria-label="Gallery position">
              {visibleVideos.map((video, index) => (
                <button
                  aria-label={`Open ${video.title}`}
                  className={index === activeFeedIndex ? 'active' : ''}
                  key={video.id}
                  onClick={() => selectVisibleVideo(index)}
                  title={video.title}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderGridMosaic = () => (
    <section
      className={`gallery-mosaic gallery-mosaic--${galleryViewMode} gallery-mosaic--${aspectFilter}`}
      aria-label={`${visibleFormatLabel} video grid`}
      style={getMosaicGridStyle(
        galleryViewMode,
        aspectFilter,
        visibleVideos,
        desktopGridAspectRatio
      )}
    >
      {visibleVideos.map((video, index) => {
        const aspectLayout = getAspectRatioLayout(video.aspectRatio);
        const interaction = interactionMap[video.id] ?? DEFAULT_INTERACTION_STATE;

        return (
          <article
            className={`gallery-mosaic__item gallery-mosaic__item--${aspectLayout}`}
            key={video.id}
            style={getMosaicTileStyle(video)}
          >
            <button
              type="button"
              className="gallery-mosaic__media"
              onClick={() => selectVisibleVideo(index)}
              title={video.title}
            >
	              <video
	                src={video.videoUrl}
                poster={video.posterUrl}
	                muted
	                loop
	                playsInline
	                preload="none"
	                className="gallery-mosaic__video"
	                onLoadedMetadata={(event) =>
	                  handleDesktopVideoLoadedMetadata(video.id, event)
                }
              />
              <div className="gallery-mosaic__shade" />
              <div className="gallery-mosaic__meta">
                <strong>{video.title}</strong>
                {video.creatorHandle && <span>@{video.creatorHandle}</span>}
              </div>
            </button>

            <div className="gallery-mosaic__actions">
              <button
                type="button"
                className={`gallery-mosaic__action${
                  video.viewerHasLiked ? ' gallery-mosaic__action--active' : ''
                }`}
                onClick={() => toggleLike(video.id)}
                disabled={interaction.liking}
                title={video.viewerHasLiked ? 'Unlike' : 'Like'}
              >
                <span>♥</span>
                <span>{video.stats.likes.toLocaleString()}</span>
              </button>
              <button
                type="button"
                className="gallery-mosaic__action"
                onClick={() => {
                  setCommentPanelVideoId(video.id);
                  void ensureCommentsLoaded(video.id);
                }}
                title="Comments"
              >
                <span>💬</span>
                <span>{video.stats.comments.toLocaleString()}</span>
              </button>
              <button
                type="button"
                className="gallery-mosaic__action"
                onClick={() => shareVideo(video)}
                disabled={interaction.sharing}
                title="Share"
              >
                <span>⤴</span>
                <span>{video.stats.shares.toLocaleString()}</span>
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );

  const renderMobileFeed = () =>
    visibleVideos.map((video, index) => {
      const interaction =
        interactionMap[video.id] ?? DEFAULT_INTERACTION_STATE;
      const isActive = index === activeFeedIndex;
      const shouldMuteVideo = !isActive || isVolumeEffectivelyMuted;
      const playbackError = videoPlaybackErrors[video.id];
      const isVideoBuffering =
        isActive &&
        isMobileAutoplayEnabled &&
        !playbackError &&
        (bufferingVideoIds[video.id] ?? true);

      return (
        <div
          key={video.id}
          className="mobile-feed__item"
          ref={(element) => {
            feedItemRefs.current[index] = element;
          }}
          data-index={index}
          onClick={(event) => handleMobileFeedItemClick(index, event)}
        >
          <video
            data-video-id={video.id}
            src={video.videoUrl}
            poster={video.posterUrl}
            className="mobile-feed__video"
            loop
            playsInline
            muted={shouldMuteVideo}
            onLoadStart={() => {
              if (isActive) {
                setVideoBuffering(video.id, true);
              }
            }}
            onLoadedMetadata={(event) =>
              handleMobileVideoLoadedMetadata(video.id, event)
            }
            onLoadedData={() => handleVideoLoadedData(video.id)}
            onCanPlay={() => handleMobileVideoCanPlay(video.id, index)}
            onPlaying={() => handleVideoPlaying(video.id)}
            onWaiting={(event) => handleVideoWaiting(video.id, event)}
            onStalled={() => handleVideoStalled(video.id)}
            onError={(event) => handleVideoError(video.id, event)}
            onEnded={() => selectVisibleVideo(index + 1)}
            preload={isActive ? 'auto' : 'none'}
          />
          {playbackError && isActive ? (
            <div className="mobile-feed__status mobile-feed__status--error" role="alert">
              <strong>Video unavailable</strong>
              <span>{playbackError}</span>
            </div>
          ) : isVideoBuffering ? (
            <div className="mobile-feed__status" role="status" aria-live="polite">
              <span className="gallery-video-status__spinner" aria-hidden="true" />
              <span>Loading video…</span>
            </div>
          ) : null}
          <div className="mobile-feed__overlay">
            {isActive && (
              <div className={volumeStyles.wrapper}>
                <button
                  type="button"
                  className={volumeStyles.toggle}
                  onClick={handleVolumeToggle}
                  aria-label={
                    isVolumeEffectivelyMuted ? 'Enable sound' : 'Mute sound'
                  }
                  aria-pressed={!isVolumeEffectivelyMuted}
                >
                  <span aria-hidden="true">{volumeIcon}</span>
                </button>

                <div
                  className={volumeSliderClassName}
                >
                  <div
                    className={volumeStyles.track}
                    role="slider"
                    aria-label="Volume"
                    aria-orientation="vertical"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={volumePercent}
                    aria-valuetext={volumeValueText}
                    tabIndex={0}
                    onPointerDown={handleVolumePointerDown}
                    onPointerMove={handleVolumePointerMove}
                    onPointerUp={handleVolumePointerEnd}
                    onPointerCancel={handleVolumePointerEnd}
                    onPointerLeave={handleVolumePointerEnd}
                    onKeyDown={handleVolumeKeyDown}
                  >
                    <div
                      className={volumeStyles.fill}
                      style={{ height: `${volumePercent}%` }}
                    />
                    <div
                      className={volumeStyles.thumb}
                      style={{ bottom: `${volumePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            <VideoOverlayContent
              variant="mobile"
              title={video.title}
              description={video.description || undefined}
            />
            <div className="mobile-feed__actions">
              <button
                type="button"
                className={`mobile-feed__action${
                  video.viewerHasLiked ? ' mobile-feed__action--active' : ''
                }`}
                onClick={() => toggleLike(video.id)}
                disabled={interaction.liking}
              >
                <span>♥</span>
                <span>{video.stats.likes.toLocaleString()}</span>
              </button>

              <button
                type="button"
                className="mobile-feed__action"
                onClick={() => {
                  setCommentPanelVideoId(video.id);
                  void ensureCommentsLoaded(video.id);
                }}
              >
                <span>💬</span>
                <span>{video.stats.comments.toLocaleString()}</span>
              </button>

              <button
                type="button"
                className="mobile-feed__action"
                onClick={() => shareVideo(video)}
                disabled={interaction.sharing}
              >
                <span>⤴</span>
                <span>{video.stats.shares.toLocaleString()}</span>
              </button>
            </div>
          </div>
        </div>
      );
    });

  return (
    <>
      <section
        className={`gallery gallery--feed${
          isMobile ? ' gallery--mobile' : ' gallery--desktop'
        }`}
      >
        {renderGalleryTopbar()}

        {showSkeleton && (
          <div className="masonry-grid" aria-hidden="true">
            {placeholderItems}
          </div>
        )}

        {!showSkeleton && error && (
          <div className="error-state">
            <p>{error}</p>
            <button className="button" onClick={handleRetryInitial}>
              Retry
            </button>
          </div>
        )}

        {!showSkeleton && !error && videos.length === 0 && (
          <div className="empty-state">
            <p>No published videos yet. Check back soon!</p>
          </div>
        )}

        {!showSkeleton && !error && videos.length > 0 && visibleVideos.length === 0 && (
          <div className="empty-state">
            <p>No {visibleFormatLabel} videos are available for this view.</p>
          </div>
        )}

        {!showSkeleton && !error && visibleVideos.length > 0 && (
          <>
            {displayMode === 'grid' ? (
              renderGridMosaic()
            ) : isMobile ? (
              <div className="mobile-feed" ref={mobileFeedRef}>
                {renderMobileFeed()}
              </div>
            ) : (
              renderDesktopStage()
            )}
          </>
        )}

      </section>

      {(isFetchingMore ||
        loadMoreError ||
        (hasMore && !supportsIntersectionObserver)) && (
        <div className="gallery__status">
          {isFetchingMore && (
            <div className="spinner" aria-label="Loading more videos" />
          )}

          {loadMoreError && (
            <div className="gallery__status-message">
              <p>{loadMoreError}</p>
              <button
                className="button button--secondary"
                onClick={handleRetryLoadMore}
              >
                Retry loading more
              </button>
            </div>
          )}

          {!isFetchingMore &&
            !loadMoreError &&
            hasMore &&
            !supportsIntersectionObserver && (
              <button
                className="button button--secondary"
                onClick={handleManualLoadMore}
              >
                Load more videos
              </button>
            )}
        </div>
      )}

      {commentPanelVideo && (
        <CommentDrawer
          video={commentPanelVideo}
          state={commentPanelState}
          open={Boolean(commentPanelVideoId)}
          onClose={() => setCommentPanelVideoId(null)}
          onSubmit={submitComment}
          onLoadMore={loadMoreComments}
        />
      )}

      {authNotice && <div className="toast toast--auth">{authNotice}</div>}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
