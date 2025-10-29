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
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react';
import type {
  PublishedVideo,
  VideoComment,
  VideoCommentState,
  VideoStats
} from '@/lib/types';
import VideoModal from './VideoModal';
import VideoOverlayContent from './VideoOverlayContent';
import volumeStyles from './MobileVolumeControl.module.css';

type PublishedVideoPayload = Partial<PublishedVideo> & Record<string, unknown>;

interface InteractionState {
  liking: boolean;
  sharing: boolean;
}

const PAGE_SIZE = 24;
const MOBILE_BREAKPOINT = 768;
const DEFAULT_MOBILE_VOLUME = 0.65;
const MIN_AUDIBLE_VOLUME = 0.02;
const MOBILE_VOLUME_HIDE_DELAY = 2200;
const VOLUME_STORAGE_KEY = 'samsar-gallery/mobile-volume';
const MUTED_STORAGE_KEY = 'samsar-gallery/mobile-muted';

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
  error: null
});

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

  return {
    id,
    videoUrl,
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
    isBotUser: Boolean(record.isBotUser)
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const valueAtPath = (source: unknown, path: string[]): unknown => {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
};

const pickString = (source: unknown, paths: string[][]): string | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value}`;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
  }

  return null;
};

const pickNumber = (source: unknown, paths: string[][]): number | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const sanitized = value.replace(/,/g, '');
      const parsed = Number.parseFloat(sanitized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
  }

  return null;
};

const pickBoolean = (source: unknown, paths: string[][]): boolean | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      if (value === 0) {
        return false;
      }
      if (value === 1) {
        return true;
      }
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
};

const pickStringFromSources = (
  sources: unknown[],
  paths: string[][]
): string | null => {
  for (const source of sources) {
    const result = pickString(source, paths);
    if (result) {
      return result;
    }
  }

  return null;
};

const pickBooleanFromSources = (
  sources: unknown[],
  paths: string[][]
): boolean | null => {
  for (const source of sources) {
    const result = pickBoolean(source, paths);
    if (result !== null) {
      return result;
    }
  }

  return null;
};

const expandCommentEntry = (entry: unknown): Record<string, unknown> | null => {
  if (!isRecord(entry)) {
    return null;
  }

  const merged: Record<string, unknown> = { ...entry };
  const nestedKeys = ['node', 'comment', 'value', 'payload', 'data'];

  nestedKeys.forEach((key) => {
    const nested = merged[key];
    if (isRecord(nested)) {
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        const hasOwn = Object.prototype.hasOwnProperty.call(
          merged,
          nestedKey
        );
        const existing = merged[nestedKey];
        // Some APIs set placeholder fields (e.g., null text) at the top level,
        // so prefer the populated nested value when the existing one is empty.
        const shouldOverride =
          !hasOwn ||
          existing === undefined ||
          existing === null ||
          (typeof existing === 'string' &&
            existing.trim().length === 0 &&
            typeof nestedValue === 'string' &&
            nestedValue.trim().length > 0);

        if (shouldOverride) {
          merged[nestedKey] = nestedValue;
        }
      }
    }
  });

  return merged;
};

const COMMENT_COLLECTION_KEYS: readonly string[] = [
  'items',
  'comments',
  'data',
  'results',
  'records',
  'collection',
  'list',
  'edges',
  'nodes',
  'docs',
  'entries',
  'values',
  'payload',
  'response',
  'children',
  'elements',
  'rows'
];

const MAX_COLLECTION_DEPTH = 4;

const findFirstArray = (value: unknown, depth = 0): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value) || depth >= MAX_COLLECTION_DEPTH) {
    return [];
  }

  for (const key of COMMENT_COLLECTION_KEYS) {
    const candidate = value[key];
    const result = findFirstArray(candidate, depth + 1);
    if (result.length > 0) {
      return result;
    }
  }

  return [];
};

const gatherMetadataSources = (
  value: unknown
): Record<string, unknown>[] => {
  const sources: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [];

  if (isRecord(value)) {
    queue.push(value);
    seen.add(value);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current)) {
      continue;
    }

    sources.push(current);

    const nestedKeys = [
      'comments',
      'data',
      'results',
      'collection',
      'records',
      'list',
      'pagination',
      'pageInfo',
      'page_info',
      'meta',
      'metadata',
      'info',
      'links'
    ];

    for (const key of nestedKeys) {
      const nested = current[key];
      if (nested && isRecord(nested) && !seen.has(nested)) {
        seen.add(nested);
        queue.push(nested);
      }
    }
  }

  return sources;
};

const normalizeComment = (payload: unknown): VideoComment | null => {
  const record =
    expandCommentEntry(payload) ??
    (isRecord(payload) ? (payload as Record<string, unknown>) : null);

  if (!record) {
    return null;
  }

  const id =
    pickString(record, [
      ['id'],
      ['_id'],
      ['commentId'],
      ['comment_id'],
      ['commentID'],
      ['uuid'],
      ['uid'],
      ['externalId'],
      ['external_id'],
      ['nodeId'],
      ['comment', 'id'],
      ['comment', '_id'],
      ['node', 'id'],
      ['node', '_id'],
      ['value', 'id'],
      ['value', '_id']
    ]) ?? '';

  const textRaw =
    pickString(record, [
      ['text'],
      ['body'],
      ['content'],
      ['message'],
      ['comment'],
      ['value'],
      ['payload', 'text'],
      ['payload', 'content'],
      ['node', 'text'],
      ['node', 'body'],
      ['node', 'content'],
      ['node', 'message'],
      ['comment', 'text'],
      ['comment', 'body'],
      ['comment', 'content'],
      ['comment', 'message'],
      ['data', 'text'],
      ['data', 'content'],
      ['attributes', 'text'],
      ['attributes', 'content']
    ]) ?? '';

  const text = textRaw.trim();
  if (!id || !text) {
    return null;
  }

  const creatorHandle =
    pickString(record, [
      ['creatorHandle'],
      ['creator_handle'],
      ['creator', 'handle'],
      ['creator', 'username'],
      ['creator', 'name'],
      ['user', 'handle'],
      ['user', 'username'],
      ['user', 'name'],
      ['author', 'handle'],
      ['author', 'username'],
      ['author', 'name'],
      ['owner', 'handle'],
      ['owner', 'username'],
      ['owner', 'name'],
      ['profile', 'handle'],
      ['profile', 'username'],
      ['profile', 'name'],
      ['createdBy', 'handle'],
      ['createdBy', 'username'],
      ['created_by', 'handle'],
      ['created_by', 'username'],
      ['account', 'handle'],
      ['account', 'username'],
      ['account', 'name']
    ]) ?? 'User';

  const createdBy =
    pickString(record, [
      ['createdBy'],
      ['created_by'],
      ['createdById'],
      ['creatorId'],
      ['creator_id'],
      ['userId'],
      ['user_id'],
      ['authorId'],
      ['author_id'],
      ['ownerId'],
      ['owner_id'],
      ['profile', 'id'],
      ['creator', 'id'],
      ['creator', '_id'],
      ['user', 'id'],
      ['user', '_id'],
      ['author', 'id'],
      ['author', '_id'],
      ['comment', 'createdBy'],
      ['comment', 'created_by']
    ]) ?? '';

  const createdAtCandidate =
    pickString(record, [
      ['createdAt'],
      ['created_at'],
      ['createdOn'],
      ['created_on'],
      ['timestamp'],
      ['publishedAt'],
      ['published_at'],
      ['insertedAt'],
      ['inserted_at'],
      ['created'],
      ['dateCreated'],
      ['date_created'],
      ['node', 'createdAt'],
      ['node', 'created_at'],
      ['comment', 'createdAt'],
      ['comment', 'created_at'],
      ['meta', 'createdAt'],
      ['meta', 'created_at']
    ]) ?? null;

  let createdAt = new Date().toISOString();
  if (createdAtCandidate) {
    const numericValue = Number(createdAtCandidate);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
      createdAt = new Date(numericValue).toISOString();
    } else if (!Number.isNaN(Date.parse(createdAtCandidate))) {
      createdAt = new Date(createdAtCandidate).toISOString();
    }
  }

  const likesValue =
    pickNumber(record, [
      ['likes'],
      ['likesCount'],
      ['likes_count'],
      ['likesTotal'],
      ['likes', 'count'],
      ['likes', 'total'],
      ['stats', 'likes'],
      ['metrics', 'likes'],
      ['interactions', 'likes'],
      ['engagement', 'likes'],
      ['node', 'likes'],
      ['comment', 'likes'],
      ['comment', 'likesCount'],
      ['meta', 'likes']
    ]) ?? 0;

  const isBotUser =
    pickBoolean(record, [
      ['isBotUser'],
      ['isBot'],
      ['bot'],
      ['creator', 'isBot'],
      ['creator', 'isBotUser'],
      ['user', 'isBot'],
      ['user', 'isBotUser'],
      ['author', 'isBot'],
      ['author', 'isBotUser'],
      ['comment', 'isBot'],
      ['comment', 'isBotUser']
    ]) ?? false;

  return {
    id,
    text,
    creatorHandle,
    createdBy,
    createdAt,
    likes: Math.max(0, Math.round(likesValue)),
    isBotUser
  };
};

interface ParsedCommentsPayload {
  items: VideoComment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const parseCommentsPayload = (payload: unknown): ParsedCommentsPayload => {
  let rawItems = findFirstArray(payload);

  if (rawItems.length === 0 && isRecord(payload)) {
    const direct = normalizeComment(payload);
    if (direct) {
      rawItems = [payload];
    }
  }

  const normalizedItems = rawItems
    .map((item) => expandCommentEntry(item) ?? item)
    .map((item) => normalizeComment(item))
    .filter((item): item is VideoComment => Boolean(item));

  const metadataSources = gatherMetadataSources(payload);

  const nextCursor =
    pickStringFromSources(metadataSources, [
      ['nextCursor'],
      ['next', 'cursor'],
      ['cursor'],
      ['pagination', 'nextCursor'],
      ['pagination', 'cursor'],
      ['pagination', 'next'],
      ['pagination', 'nextToken'],
      ['pagination', 'next_token'],
      ['pageInfo', 'endCursor'],
      ['pageInfo', 'end_cursor'],
      ['meta', 'nextCursor'],
      ['meta', 'next_cursor'],
      ['meta', 'nextToken'],
      ['meta', 'next_token'],
      ['comments', 'nextCursor'],
      ['comments', 'cursor'],
      ['comments', 'next', 'cursor'],
      ['comments', 'pagination', 'nextCursor'],
      ['data', 'nextCursor'],
      ['data', 'cursor'],
      ['data', 'pagination', 'nextCursor']
    ]) ?? null;

  const hasMoreFlag =
    pickBooleanFromSources(metadataSources, [
      ['hasMore'],
      ['has_more'],
      ['hasNext'],
      ['hasNextPage'],
      ['pagination', 'hasMore'],
      ['pagination', 'has_more'],
      ['pagination', 'hasNext'],
      ['pagination', 'hasNextPage'],
      ['pageInfo', 'hasNextPage'],
      ['pageInfo', 'has_next_page'],
      ['meta', 'hasMore'],
      ['meta', 'has_more'],
      ['meta', 'hasNext'],
      ['comments', 'hasMore'],
      ['comments', 'has_more'],
      ['data', 'hasMore'],
      ['data', 'has_more']
    ]);

  return {
    items: normalizedItems,
    nextCursor,
    hasMore: hasMoreFlag ?? Boolean(nextCursor)
  };
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
  if (video.videoUrl) {
    return video.videoUrl;
  }

  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('videoId', video.id);
    return url.toString();
  }

  return '';
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
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [activeFeedIndex, setActiveFeedIndex] = useState<number>(0);
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
  const [showMobileVolume, setShowMobileVolume] = useState<boolean>(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedItemRefs = useRef<(HTMLDivElement | null)[]>([]);
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

      const activeElement =
        feedItemRefs.current[activeFeedIndex]?.querySelector('video');

      if (activeElement instanceof HTMLVideoElement) {
        activeElement.volume = resolvedVolume;
        activeElement.muted = shouldMute;

        if (!shouldMute) {
          const playAttempt = activeElement.play();
          if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {});
          }
        }
      }
    },
    [activeFeedIndex, isMobile]
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

    storages.forEach((storage) => {
      try {
        storage.setItem(VOLUME_STORAGE_KEY, volumeValue);
        storage.setItem(MUTED_STORAGE_KEY, mutedValue);
      } catch {
        // Storage writes might fail (e.g., quota exceeded). Ignore.
      }
    });
  }, [mobileMuted, mobileVolume]);

  const handleModalVolumeChange = useCallback(
    (volume: number, muted: boolean) => {
      const clamped = clampVolume(volume);

      if (muted) {
        if (clamped > MIN_AUDIBLE_VOLUME) {
          lastAudibleVolumeRef.current = clamped;
        }
        commitMobileVolume(0);
        return;
      }

      commitMobileVolume(clamped);
    },
    [commitMobileVolume]
  );

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
    if (mobileMuted) {
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
  }, [commitMobileVolume, mobileMuted, mobileVolume, revealVolumeOverlay]);

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
    },
    [isMobile, showVolumeOverlay, updateVolumeFromTrack]
  );

  const handleVolumePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!adjustingVolumeRef.current) {
        return;
      }

      event.preventDefault();
      updateVolumeFromTrack(event.currentTarget, event.clientY);
    },
    [updateVolumeFromTrack]
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

  const handleMobileVideoLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      if (!isMobile) {
        return;
      }

      const videoElement = event.currentTarget;
      const shouldMute = mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
      const resolvedVolume = shouldMute ? 0 : mobileVolume;

      videoElement.volume = resolvedVolume;

      if (shouldMute && !videoElement.muted) {
        videoElement.muted = true;
      }
    },
    [isMobile, mobileMuted, mobileVolume]
  );

  const handleMobileVideoClick = useCallback(
    (index: number) => {
      if (!isMobile || index !== activeFeedIndex) {
        return;
      }

      const muted = mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
      if (!muted) {
        return;
      }

      const fallbackVolume =
        mobileVolume > MIN_AUDIBLE_VOLUME
          ? mobileVolume
          : lastAudibleVolumeRef.current;
      const targetVolume = clampVolume(
        fallbackVolume && fallbackVolume > MIN_AUDIBLE_VOLUME
          ? fallbackVolume
          : DEFAULT_MOBILE_VOLUME
      );

      commitMobileVolume(targetVolume);
      revealVolumeOverlay();
    },
    [
      activeFeedIndex,
      commitMobileVolume,
      isMobile,
      mobileMuted,
      mobileVolume,
      revealVolumeOverlay
    ]
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
    },
    [commitMobileVolume, mobileVolume, revealVolumeOverlay]
  );

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
          throw new Error(
            `Failed to load videos (${response.status})`
          );
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

        setVideos((previous) =>
          loadMore ? mergeVideos(previous, normalized) : normalized
        );

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
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load more videos'
          );
          setHasMore(false);
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

  const ensureCommentsLoaded = useCallback(
    async (videoId: string) => {
      let shouldRequest = false;

      setCommentsMap((previous) => {
        const current =
          previous[videoId] ?? createInitialCommentState();
        if (current.items.length === 0 && !current.isLoading) {
          shouldRequest = true;
          return {
            ...previous,
            [videoId]: {
              ...current,
              isLoading: true,
              error: null
            }
          };
        }

        return previous;
      });

      if (!shouldRequest) {
        return;
      }

      try {
        const response = await fetch(
          `/api/videos/${videoId}/comments?limit=20`,
          {
            method: 'GET',
            cache: 'no-store'
          }
        );

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to load comments.');
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
        } = parseCommentsPayload(payload);

        setCommentsMap((previous) => ({
          ...previous,
          [videoId]: {
            ...(previous[videoId] ?? createInitialCommentState()),
            items: normalized,
            nextCursor,
            hasMore,
            isLoading: false,
            error: null,
            isPosting:
              previous[videoId]?.isPosting ?? false
          }
        }));
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load comments.';
        setCommentsMap((previous) => ({
          ...previous,
          [videoId]: {
            ...(previous[videoId] ?? createInitialCommentState()),
            isLoading: false,
            error: message
          }
        }));
      }
    },
    []
  );

  const loadMoreComments = useCallback(
    async (videoId: string) => {
      const current = commentsMap[videoId] ?? createInitialCommentState();
      if (!current.hasMore || current.isLoading) {
        return;
      }

      setCommentsMap((previous) => ({
        ...previous,
        [videoId]: {
          ...(previous[videoId] ?? createInitialCommentState()),
          isLoading: true,
          error: null
        }
      }));

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
          const message = await response.text();
          throw new Error(message || 'Failed to load comments.');
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
        } = parseCommentsPayload(payload);

        setCommentsMap((previous) => {
          const state =
            previous[videoId] ?? createInitialCommentState();
          return {
            ...previous,
            [videoId]: {
              ...state,
              items: [...state.items, ...normalized],
              nextCursor,
              hasMore,
              isLoading: false,
              error: null
            }
          };
        });
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load comments.';
        setCommentsMap((previous) => ({
          ...previous,
          [videoId]: {
            ...(previous[videoId] ?? createInitialCommentState()),
            isLoading: false,
            error: message
          }
        }));
      }
    },
    [commentsMap]
  );

  const submitComment = useCallback(
    async (videoId: string, text: string) => {
      setCommentsMap((previous) => ({
        ...previous,
        [videoId]: {
          ...(previous[videoId] ?? createInitialCommentState()),
          isPosting: true,
          error: null
        }
      }));

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
          if (response.status === 401) {
            promptLogin('Log in to leave a comment.');
          }
          const message = await response.text();
          throw new Error(message || 'Failed to post comment.');
        }

        const payload = await response.json();
        const newComment = normalizeComment(payload?.comment);
        if (!newComment) {
          throw new Error('Invalid comment response.');
        }

        const statsPayload = payload?.stats as Partial<VideoStats> | undefined;

        setCommentsMap((previous) => {
          const state =
            previous[videoId] ?? createInitialCommentState();
          return {
            ...previous,
            [videoId]: {
              ...state,
              items: [newComment, ...state.items],
              isPosting: false,
              error: null
            }
          };
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
        setCommentsMap((previous) => ({
          ...previous,
          [videoId]: {
            ...(previous[videoId] ?? createInitialCommentState()),
            isPosting: false,
            error: message
          }
        }));

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
    fetchVideos();
  }, [fetchVideos]);

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
  }, [
    fetchVideos,
    hasMore,
    isFetchingMore,
    isLoading,
    nextCursor,
    supportsIntersectionObserver
  ]);

  useEffect(() => {
    feedItemRefs.current = feedItemRefs.current.slice(0, videos.length);

    if (!isMobile) {
      return;
    }

    const elements = feedItemRefs.current.filter(
      (element): element is HTMLDivElement => Boolean(element)
    );
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const indexValue = Number(
              entry.target.getAttribute('data-index')
            );
            if (!Number.isNaN(indexValue)) {
              setActiveFeedIndex(indexValue);
            }
          }
        });
      },
      { threshold: 0.6 }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, [isMobile, videos.length]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const shouldMuteActive = mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
    const resolvedVolume = shouldMuteActive ? 0 : mobileVolume;

    feedItemRefs.current.forEach((element, index) => {
      const videoElement = element?.querySelector('video') as
        | HTMLVideoElement
        | null;
      if (!videoElement) {
        return;
      }

      videoElement.volume = resolvedVolume;

      if (index === activeFeedIndex) {
        videoElement.muted = shouldMuteActive;
        const play = videoElement.play();
        if (play && typeof play.catch === 'function') {
          play.catch(() => {});
        }
      } else {
        videoElement.muted = true;
        videoElement.pause();
      }
    });
  }, [
    activeFeedIndex,
    isMobile,
    mobileMuted,
    mobileVolume,
    videos
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
    if (!isMobile || typeof document === 'undefined') {
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
  }, [commentPanelVideoId, isMobile]);

  const videoById = useMemo(() => {
    return new Map(videos.map((video) => [video.id, video]));
  }, [videos]);

  const selectedVideo = selectedVideoId
    ? videoById.get(selectedVideoId) ?? null
    : null;

  const selectedComments =
    selectedVideo?.id && commentsMap[selectedVideo.id]
      ? commentsMap[selectedVideo.id]
      : createInitialCommentState();

  const selectedInteraction =
    selectedVideo?.id && interactionMap[selectedVideo.id]
      ? interactionMap[selectedVideo.id]
      : DEFAULT_INTERACTION_STATE;

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

  const renderDesktopVideos = () =>
    videos.map((video) => (
      <article
        key={video.id}
        className="video-card"
        onClick={() => setSelectedVideoId(video.id)}
        tabIndex={0}
        role="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedVideoId(video.id);
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
          <div className="video-card__inline-stats">
            <span>♥ {video.stats.likes.toLocaleString()}</span>
            <span>💬 {video.stats.comments.toLocaleString()}</span>
            <span>⤴ {video.stats.shares.toLocaleString()}</span>
          </div>
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

  const isVolumeEffectivelyMuted =
    mobileMuted || mobileVolume <= MIN_AUDIBLE_VOLUME;
  const preferredModalVolume = clampVolume(
    isVolumeEffectivelyMuted && mobileVolume <= MIN_AUDIBLE_VOLUME
      ? lastAudibleVolumeRef.current > MIN_AUDIBLE_VOLUME
        ? lastAudibleVolumeRef.current
        : DEFAULT_MOBILE_VOLUME
      : mobileVolume
  );
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

  const renderMobileFeed = () =>
    videos.map((video, index) => {
      const interaction =
        interactionMap[video.id] ?? DEFAULT_INTERACTION_STATE;
      const isActive = index === activeFeedIndex;
      const shouldMuteVideo = !isActive || isVolumeEffectivelyMuted;

      return (
        <div
          key={video.id}
          className="mobile-feed__item"
          ref={(element) => {
            feedItemRefs.current[index] = element;
          }}
          data-index={index}
        >
          <video
            src={video.videoUrl}
            className="mobile-feed__video"
            loop
            playsInline
            muted={shouldMuteVideo}
            onLoadedMetadata={handleMobileVideoLoadedMetadata}
            onClick={() => handleMobileVideoClick(index)}
            preload="metadata"
          />
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
      <section className={`gallery${isMobile ? ' gallery--mobile' : ''}`}>
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
          <>
            {isMobile ? (
              <div className="mobile-feed">{renderMobileFeed()}</div>
            ) : (
              <div className="masonry-grid">{renderDesktopVideos()}</div>
            )}
          </>
        )}
      </section>

      <div className="gallery__sentinel" ref={sentinelRef} aria-hidden />

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

      {selectedVideo && !isMobile && (
        <VideoModal
          video={selectedVideo}
          stats={selectedVideo.stats}
          viewerHasLiked={selectedVideo.viewerHasLiked}
          comments={selectedComments}
          isLiking={selectedInteraction.liking}
          isSharing={selectedInteraction.sharing}
          onToggleLike={toggleLike}
          onShare={shareVideo}
          onSubmitComment={submitComment}
          onLoadMoreComments={loadMoreComments}
          onEnsureComments={ensureCommentsLoaded}
          initialVolume={preferredModalVolume}
          initialMuted={isVolumeEffectivelyMuted}
          onVolumeChange={handleModalVolumeChange}
          onClose={() => setSelectedVideoId(null)}
        />
      )}

      {isMobile && commentPanelVideo && (
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
