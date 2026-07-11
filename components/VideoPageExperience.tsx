/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import VideoPageMobileNav from './VideoPageMobileNav';
import { getExistingAuthToken, verifyAuthToken } from '@/lib/auth';
import { normalizeComment, parseCommentsPayload } from '@/lib/comments';
import type {
  AuthenticatedUser,
  PublishedVideo,
  VideoComment,
  VideoStats
} from '@/lib/types';
import {
  aspectRatioNumber,
  formatCompactNumber,
  formatPublishedDate,
  normalizeVideo,
  parseVideoCollection
} from '@/lib/videos';
import BotUserLabel from './BotUserLabel';
import { getVideoPagePath } from '@/lib/site';

type IconName = 'close' | 'copy' | 'heart' | 'info' | 'message' | 'play' | 'send' | 'share';

function Icon({ name, size = 21 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    copy: <><rect height="14" rx="2" width="14" x="8" y="8" /><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
    play: <path d="m7 4 13 8-13 8Z" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4" /><path d="m8.6 13.5 6.8 4" /></>
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

const openLogin = () => {
  window.dispatchEvent(
    new CustomEvent('samsar:open-auth', { detail: { view: 'login' } })
  );
};

const RECOMMENDATION_ASPECT_RATIO_TOLERANCE = 0.02;

const matchesAspectRatio = (video: PublishedVideo, targetRatio: number): boolean => {
  const ratio = aspectRatioNumber(video.aspectRatio);
  return ratio !== null && Math.abs(ratio - targetRatio) <= RECOMMENDATION_ASPECT_RATIO_TOLERANCE;
};

const getDisplayName = (user: AuthenticatedUser | null): string => {
  if (!user) return 'You';
  const record = user as Record<string, unknown>;
  for (const key of ['username', 'displayName', 'name', 'email']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'You';
};

const getInitial = (handle: string) => {
  const clean = handle.replace(/^@/, '').trim();
  return (clean.charAt(0) || 'S').toUpperCase();
};

const formatCommentDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {})
  }).format(date);
};

function ExpandableVideoDescription({ description }: { description: string }) {
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [description]);

  useEffect(() => {
    if (expanded) return;
    const element = descriptionRef.current;
    if (!element) return;

    const measure = () => {
      const current = descriptionRef.current;
      if (!current) return;
      const collapsedHeight = current.clientHeight;
      current.classList.add('video-page__description--expanded');
      const expandedHeight = current.scrollHeight;
      current.classList.remove('video-page__description--expanded');
      setIsOverflowing(expandedHeight - collapsedHeight > 1);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  return (
    <div className="video-page__description-wrap">
      <p
        className={`video-page__description${expanded ? ' video-page__description--expanded' : ''}`}
        id={descriptionId}
        ref={descriptionRef}
      >
        {description}
      </p>
      {(isOverflowing || expanded) ? (
        <button
          aria-controls={descriptionId}
          aria-expanded={expanded}
          className="video-page__description-toggle"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? 'View less' : 'View more'}
        </button>
      ) : null}
    </div>
  );
}

function CommentItem({ comment, depth = 0 }: { comment: VideoComment; depth?: number }) {
  const replies = comment.replies ?? [];
  return (
    <div className={`video-comments__thread${depth ? ' video-comments__thread--reply' : ''}`}>
      <article className="video-comments__comment">
        <span className="video-comments__avatar" aria-hidden="true">
          {getInitial(comment.creatorHandle)}
        </span>
        <div className="video-comments__comment-body">
          <div className="video-comments__comment-meta">
            <strong>
              {comment.creatorHandle}
              {comment.isBotUser ? <BotUserLabel /> : null}
            </strong>
            <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
          </div>
          <p>{comment.text}</p>
          {comment.likes > 0 ? (
            <span className="video-comments__comment-likes">
              <Icon name="heart" size={12} /> {formatCompactNumber(comment.likes)}
            </span>
          ) : null}
        </div>
      </article>
      {replies.length > 0 ? (
        <div className="video-comments__replies">
          {replies.map((reply) => (
            <CommentItem comment={reply} depth={depth + 1} key={reply.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface CommentsPanelProps {
  comments: VideoComment[];
  desktopInline?: boolean;
  emptyMessage?: string;
  error: string | null;
  hasMore: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPosting: boolean;
  onClose?: () => void;
  onLoadMore: () => void;
  onSubmit: (text: string) => Promise<void>;
  stats: VideoStats;
  user: AuthenticatedUser | null;
}

function CommentsPanel({
  comments,
  desktopInline = false,
  emptyMessage,
  error,
  hasMore,
  isAuthenticated,
  isLoading,
  isPosting,
  onClose,
  onLoadMore,
  onSubmit,
  stats,
  user
}: CommentsPanelProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = text.trim();
    if (!next || isPosting) return;
    try {
      await onSubmit(next);
      setText('');
    } catch {
      // The parent surfaces the request error inside the comments panel.
    }
  };

  return (
    <div className={`video-comments${desktopInline ? ' video-comments--inline-desktop' : ''}`}>
      <header className="video-comments__header">
        <div>
          <span>Conversation</span>
          <h2>Comments <small>{formatCompactNumber(stats.comments)}</small></h2>
        </div>
        {onClose ? (
          <button aria-label="Close comments" onClick={onClose} type="button">
            <Icon name="close" size={19} />
          </button>
        ) : null}
      </header>

      {isAuthenticated || desktopInline ? (
        <form className="video-comments__composer" onSubmit={submit}>
          <span className="video-comments__avatar" aria-hidden="true">
            {isAuthenticated ? getInitial(getDisplayName(user)) : 'S'}
          </span>
          <label className="sr-only" htmlFor="video-page-comment">Add a comment</label>
          <input
            id="video-page-comment"
            disabled={!isAuthenticated || isPosting}
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
            placeholder={isAuthenticated ? 'Add to the conversation…' : 'Log in to add a comment'}
            ref={inputRef}
            value={text}
          />
          <button
            aria-label="Post comment"
            disabled={!isAuthenticated || isPosting || text.trim().length === 0}
            type="submit"
          >
            <Icon name="send" size={18} />
            <span className="video-comments__submit-label">Comment</span>
          </button>
        </form>
      ) : (
        <button className="video-comments__login" onClick={openLogin} type="button">
          <span>Join the conversation</span>
          <strong>Log in to comment</strong>
        </button>
      )}

      {desktopInline && !isAuthenticated ? (
        <p className="video-comments__login-note">
          <button onClick={openLogin} type="button">Log in</button> to join the conversation.
        </p>
      ) : null}

      <div className="video-comments__list" aria-live="polite">
        {comments.map((comment) => <CommentItem comment={comment} key={comment.id} />)}
        {isLoading ? (
          <div className="video-comments__loading">
            <span /><span /><span />
            <p>Loading comments</p>
          </div>
        ) : null}
        {!isLoading && comments.length === 0 && !error ? (
          <div className="video-comments__empty">
            {emptyMessage ? (
              <strong>{emptyMessage}</strong>
            ) : (
              <>
                <Icon name="message" size={25} />
                <strong>Start the conversation</strong>
                <span>Share what stood out to you.</span>
              </>
            )}
          </div>
        ) : null}
        {error ? <p className="video-comments__error" role="alert">{error}</p> : null}
        {hasMore && !isLoading ? (
          <button className="video-comments__more" onClick={onLoadMore} type="button">
            Load more comments
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface VideoPageExperienceProps {
  creator: string;
  portrait: boolean;
  video: PublishedVideo;
}

export default function VideoPageExperience({ creator, portrait, video }: VideoPageExperienceProps) {
  const [currentVideo, setCurrentVideo] = useState(video);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [portraitDetailsOpen, setPortraitDetailsOpen] = useState(false);
  const [mobileDescriptionOpen, setMobileDescriptionOpen] = useState(false);
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const [mobileFeedStarted, setMobileFeedStarted] = useState(false);
  const [activeMobileFeedId, setActiveMobileFeedId] = useState(video.id);
  const [isMobile, setIsMobile] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [recommendations, setRecommendations] = useState<PublishedVideo[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const shareMenuId = useId();
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const mobileFeedRef = useRef<HTMLDivElement>(null);
  const mobileFeedItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const mobileFeedVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = authReady && Boolean(authToken && user);
  const aspectRatio = aspectRatioNumber(currentVideo.aspectRatio);
  const recommendationAspectRatio = aspectRatio ?? (portrait ? 9 / 16 : 16 / 9);
  const recommendationFormat = recommendationAspectRatio < 0.9
    ? 'portrait'
    : Math.abs(recommendationAspectRatio - 1) <= 0.1
      ? 'square'
      : 'landscape';
  const isSixteenNine = aspectRatio !== null && Math.abs(aspectRatio - (16 / 9)) < 0.02;
  const desktopSixteenNine = isSixteenNine && !isMobile;
  const immersiveMobile = isMobile && (portrait || (isSixteenNine && mobileLandscape));
  const visibleRecommendations = useMemo(
    () => recommendations.filter((item) => (
      item.id !== video.id && matchesAspectRatio(item, recommendationAspectRatio)
    )),
    [recommendationAspectRatio, recommendations, video.id]
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshAuth = useCallback(async () => {
    const token = getExistingAuthToken();
    if (!token) {
      setAuthToken(null);
      setUser(null);
      setAuthReady(true);
      return;
    }
    const profile = await verifyAuthToken(token);
    setAuthToken(profile ? token : null);
    setUser(profile);
    setAuthReady(true);
  }, []);

  useEffect(() => {
    void refreshAuth();
    const onStorage = () => void refreshAuth();
    window.addEventListener('storage', onStorage);
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('oauth_channel') : null;
    channel?.addEventListener('message', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.removeEventListener('message', onStorage);
      channel?.close();
    };
  }, [refreshAuth]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px), (max-width: 960px) and (max-height: 500px) and (orientation: landscape)');
    const landscapeMedia = window.matchMedia('(orientation: landscape)');
    const apply = () => {
      setIsMobile(media.matches);
      setMobileLandscape(media.matches && landscapeMedia.matches);
      setCommentsOpen(!media.matches && !portrait);
      if (media.matches) {
        setPortraitDetailsOpen(false);
        setMobileDescriptionOpen(false);
      }
    };
    apply();
    media.addEventListener('change', apply);
    landscapeMedia.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
      landscapeMedia.removeEventListener('change', apply);
    };
  }, [portrait]);

  useEffect(() => {
    setActiveMobileFeedId(video.id);
    setMobileFeedStarted(false);
    setMobileDescriptionOpen(false);
  }, [video.id]);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, [currentVideo.id]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!shareMenuRef.current?.contains(event.target as Node)) setShareMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setRecommendationsLoading(true);
      setRecommendationsError(false);
      try {
        const query = new URLSearchParams({
          videoId: video.id,
          format: recommendationFormat,
          limit: '14'
        });
        const response = await fetch(`/api/gallery/recommendations?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Recommendations unavailable');
        const parsed = parseVideoCollection(await response.json());
        setRecommendations(parsed.items.filter((item) => (
          item.id !== video.id && matchesAspectRatio(item, recommendationAspectRatio)
        )));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setRecommendations([]);
          setRecommendationsError(true);
        }
      } finally {
        if (!controller.signal.aborted) setRecommendationsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [recommendationAspectRatio, recommendationFormat, video.id]);

  const mobileFeedVideos = useMemo(() => {
    const unique = new Map<string, PublishedVideo>();
    [currentVideo, ...visibleRecommendations].forEach((item) => unique.set(item.id, item));
    return Array.from(unique.values()).slice(0, 9);
  }, [currentVideo, visibleRecommendations]);

  const mobileFeedIds = useMemo(
    () => mobileFeedVideos.map((item) => item.id).join('|'),
    [mobileFeedVideos]
  );

  useEffect(() => {
    if (!authReady) return;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    void fetch(`/api/videos/${encodeURIComponent(video.id)}`, { headers, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const source = payload?.publication ?? payload?.video ?? payload?.data ?? payload;
        const refreshed = normalizeVideo(source);
        if (refreshed) setCurrentVideo(refreshed);
      })
      .catch(() => undefined);
  }, [authReady, authToken, video.id]);

  const loadComments = useCallback(async (append = false) => {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const query = new URLSearchParams({ limit: '20' });
      if (append && commentsCursor) query.set('cursor', commentsCursor);
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
      const response = await fetch(
        `/api/videos/${encodeURIComponent(video.id)}/comments?${query.toString()}`,
        { headers, cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load comments.');
      const parsed = parseCommentsPayload(payload);
      setComments((previous) => {
        const next = append ? [...previous, ...parsed.items] : parsed.items;
        return Array.from(new Map(next.map((item) => [item.id, item])).values());
      });
      setCommentsCursor(parsed.nextCursor);
      setHasMoreComments(parsed.hasMore);
      setCommentsLoaded(true);
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Unable to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  }, [authToken, commentsCursor, commentsLoading, video.id]);

  useEffect(() => {
    if (commentsOpen && !commentsLoaded && !commentsLoading) void loadComments();
  }, [commentsLoaded, commentsLoading, commentsOpen, loadComments]);

  useEffect(() => {
    if (!isMobile || (!commentsOpen && !mobileDescriptionOpen && !immersiveMobile)) return;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [commentsOpen, immersiveMobile, isMobile, mobileDescriptionOpen]);

  useEffect(() => {
    if (!isMobile || mobileFeedVideos.length === 0) return;
    const items = Object.values(mobileFeedItemRefs.current).filter(
      (item): item is HTMLElement => Boolean(item)
    );
    if (items.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const id = (visible?.target as HTMLElement | undefined)?.dataset.mobileFeedId;
      if (id && visible.intersectionRatio >= 0.55) setActiveMobileFeedId(id);
    }, {
      root: immersiveMobile ? mobileFeedRef.current : null,
      threshold: [0.4, 0.55, 0.75, 0.9]
    });

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [immersiveMobile, isMobile, mobileFeedIds, mobileFeedVideos.length]);

  useEffect(() => {
    if (!isMobile) return;
    const shouldAutoplay = !immersiveMobile || mobileFeedStarted;
    Object.entries(mobileFeedVideoRefs.current).forEach(([id, element]) => {
      if (!element) return;
      if (id !== activeMobileFeedId || !shouldAutoplay) {
        element.pause();
        return;
      }

      element.muted = !immersiveMobile;
      void element.play().catch(() => {
        if (immersiveMobile && id === currentVideo.id) {
          element.muted = false;
          return;
        }
        element.muted = true;
        void element.play().catch(() => undefined);
      });
    });
  }, [activeMobileFeedId, currentVideo.id, immersiveMobile, isMobile, mobileFeedIds, mobileFeedStarted]);

  useEffect(() => {
    if (!commentsOpen && !portraitDetailsOpen && !mobileDescriptionOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!portrait && !isMobile)) return;
      setCommentsOpen(false);
      setPortraitDetailsOpen(false);
      setMobileDescriptionOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [commentsOpen, isMobile, mobileDescriptionOpen, portrait, portraitDetailsOpen]);

  const toggleLike = async () => {
    if (!isAuthenticated || !authToken || isLiking) return;
    setIsLiking(true);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(video.id)}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to update like.');
      setCurrentVideo((previous) => {
        const liked = typeof payload?.liked === 'boolean' ? payload.liked : !previous.viewerHasLiked;
        const likes = typeof payload?.stats?.likes === 'number'
          ? payload.stats.likes
          : Math.max(0, previous.stats.likes + (liked ? 1 : -1));
        return { ...previous, viewerHasLiked: liked, stats: { ...previous.stats, likes } };
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update like.');
    } finally {
      setIsLiking(false);
    }
  };

  const recordShare = () => {
    if (!authToken) return;
    void fetch(`/api/videos/${encodeURIComponent(video.id)}/share`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const shares = payload?.stats?.shares;
        if (typeof shares === 'number') {
          setCurrentVideo((previous) => ({
            ...previous,
            stats: { ...previous.stats, shares }
          }));
        }
      })
      .catch(() => undefined);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      setShareMenuOpen(false);
      showToast('Link copied to clipboard');
      recordShare();
    } catch {
      showToast('Unable to copy the link.');
    }
  };

  const shareVideo = async () => {
    const url = shareUrl || window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: currentVideo.title, url });
        recordShare();
      } else {
        await copyShareLink();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast('Unable to share this video.');
    }
  };

  const submitComment = async (text: string) => {
    if (!authToken || !isAuthenticated) {
      openLogin();
      return;
    }
    setCommentPosting(true);
    setCommentsError(null);
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(video.id)}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to post comment.');
      const comment = normalizeComment(payload?.comment);
      if (comment) setComments((previous) => [comment, ...previous]);
      setCommentsLoaded(true);
      setCurrentVideo((previous) => ({
        ...previous,
        stats: {
          ...previous.stats,
          comments: typeof payload?.stats?.comments === 'number'
            ? payload.stats.comments
            : previous.stats.comments + 1
        }
      }));
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Unable to post comment.');
      throw error;
    } finally {
      setCommentPosting(false);
    }
  };

  const openComments = () => {
    setMobileDescriptionOpen(false);
    setCommentsOpen(true);
    if (portrait && !isMobile) setPortraitDetailsOpen(true);
    if (!portrait && !isMobile) {
      window.requestAnimationFrame(() => commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const openMobileDescription = () => {
    setCommentsOpen(false);
    setMobileDescriptionOpen(true);
  };

  const startImmersivePlayback = (id: string) => {
    const element = mobileFeedVideoRefs.current[id];
    if (!element) return;
    setActiveMobileFeedId(id);
    setMobileFeedStarted(true);
    element.muted = false;
    void element.play().catch(() => undefined);
  };

  const advanceMobileFeed = (id: string) => {
    const index = mobileFeedVideos.findIndex((item) => item.id === id);
    const next = mobileFeedVideos[index + 1];
    if (!next) return;
    setActiveMobileFeedId(next.id);
    mobileFeedItemRefs.current[next.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const commentsPanel = (
    <CommentsPanel
      comments={comments}
      desktopInline={desktopSixteenNine}
      emptyMessage={desktopSixteenNine ? 'No comments yet' : undefined}
      error={commentsError}
      hasMore={hasMoreComments}
      isAuthenticated={isAuthenticated}
      isLoading={commentsLoading}
      isPosting={commentPosting}
      onClose={portrait || isMobile ? () => setCommentsOpen(false) : undefined}
      onLoadMore={() => void loadComments(true)}
      onSubmit={submitComment}
      stats={currentVideo.stats}
      user={user}
    />
  );

  const actionButtons = (
    <div className={`video-interactions${portrait ? ' video-interactions--portrait' : ''}`}>
      <button
        aria-label={currentVideo.viewerHasLiked ? 'Unlike video' : 'Like video'}
        className={currentVideo.viewerHasLiked ? 'is-active' : ''}
        disabled={!isAuthenticated || isLiking}
        onClick={() => void toggleLike()}
        title={!authReady ? 'Checking sign-in status' : !isAuthenticated ? 'Log in to like this video' : undefined}
        type="button"
      >
        <span className="video-interactions__icon"><Icon name="heart" size={22} /></span>
        <span className="video-interactions__label">Like</span>
        <small>{formatCompactNumber(currentVideo.stats.likes)}</small>
      </button>
      <button aria-label="Open comments" onClick={openComments} type="button">
        <span className="video-interactions__icon"><Icon name="message" size={22} /></span>
        <span className="video-interactions__label">Comments</span>
        <small>{formatCompactNumber(currentVideo.stats.comments)}</small>
      </button>
      <button aria-label="Share video" onClick={() => void shareVideo()} type="button">
        <span className="video-interactions__icon"><Icon name="share" size={21} /></span>
        <span className="video-interactions__label">Share</span>
        {portrait ? <small>Share</small> : null}
      </button>
    </div>
  );

  const mobilePrimaryActions = (
    <div className={`mobile-video-actions${immersiveMobile ? ' mobile-video-actions--overlay' : ' mobile-video-actions--row'}`}>
      <button
        aria-label={currentVideo.viewerHasLiked ? 'Unlike video' : 'Like video'}
        className={currentVideo.viewerHasLiked ? 'is-active' : ''}
        disabled={!isAuthenticated || isLiking}
        onClick={() => void toggleLike()}
        type="button"
      >
        <span><Icon name="heart" size={22} /></span>
        <small>{formatCompactNumber(currentVideo.stats.likes)}</small>
      </button>
      <button aria-label="Open comments" onClick={openComments} type="button">
        <span><Icon name="message" size={22} /></span>
        <small>{formatCompactNumber(currentVideo.stats.comments)}</small>
      </button>
      <button aria-label="Share video" onClick={() => void shareVideo()} type="button">
        <span><Icon name="share" size={21} /></span>
        <small>Share</small>
      </button>
      <button aria-label="Show video description" onClick={openMobileDescription} type="button">
        <span><Icon name="info" size={22} /></span>
        <small>Details</small>
      </button>
    </div>
  );

  const mobileImmersiveFeed = (
    <div
      className={`mobile-video-feed${portrait ? ' mobile-video-feed--portrait' : ' mobile-video-feed--landscape'}`}
      ref={mobileFeedRef}
    >
      <VideoPageMobileNav />
      {mobileFeedVideos.map((item) => {
        const isPrimary = item.id === currentVideo.id;
        const isActive = item.id === activeMobileFeedId;
        const itemCreator = item.creatorHandle ? `@${item.creatorHandle}` : 'Samsar creator';
        return (
          <article
            className={`mobile-video-feed__item${isActive ? ' is-active' : ''}`}
            data-mobile-feed-id={item.id}
            key={item.id}
            ref={(element) => { mobileFeedItemRefs.current[item.id] = element; }}
          >
            <video
              autoPlay={mobileFeedStarted && isActive}
              muted={!mobileFeedStarted}
              onCanPlay={(event) => {
                if (!mobileFeedStarted || item.id !== activeMobileFeedId) return;
                event.currentTarget.muted = false;
                void event.currentTarget.play().catch(() => undefined);
              }}
              onClick={() => startImmersivePlayback(item.id)}
              onEnded={() => advanceMobileFeed(item.id)}
              playsInline
              poster={item.posterUrl}
              preload={isPrimary ? 'auto' : 'metadata'}
              ref={(element) => { mobileFeedVideoRefs.current[item.id] = element; }}
              src={item.videoUrl}
            />
            <span className="mobile-video-feed__shade" aria-hidden="true" />
            {!mobileFeedStarted && isPrimary ? (
              <button
                aria-label="Play video with sound"
                className="mobile-video-feed__play"
                onClick={() => startImmersivePlayback(item.id)}
                type="button"
              >
                <Icon name="play" size={28} />
                <span>Tap to play</span>
              </button>
            ) : null}
            <div className="mobile-video-feed__title">
              <small>{itemCreator}</small>
              {isPrimary ? (
                <h1>{item.title}</h1>
              ) : (
                <a href={getVideoPagePath(item.id)}><h2>{item.title}</h2></a>
              )}
            </div>
            {isPrimary ? mobilePrimaryActions : null}
          </article>
        );
      })}
      {recommendationsLoading ? <div className="mobile-video-feed__state">Loading more videos…</div> : null}
    </div>
  );

  const mobileLandscapeView = (
    <div className="mobile-landscape-view">
      <article
        className="mobile-landscape-view__primary"
        data-mobile-feed-id={currentVideo.id}
        ref={(element) => { mobileFeedItemRefs.current[currentVideo.id] = element; }}
      >
        <div className="mobile-landscape-view__media">
          <VideoPageMobileNav />
          <video
            autoPlay
            controls
            muted
            onEnded={() => advanceMobileFeed(currentVideo.id)}
            playsInline
            poster={currentVideo.posterUrl}
            preload="auto"
            ref={(element) => { mobileFeedVideoRefs.current[currentVideo.id] = element; }}
            src={currentVideo.videoUrl}
          />
        </div>
        <div className="mobile-landscape-view__summary">
          <small>{creator}</small>
          <h1>{currentVideo.title}</h1>
          <div className="video-page__meta">
            <span>{formatCompactNumber(currentVideo.stats.views)} views</span>
            <span aria-hidden="true">•</span>
            <span>{formatPublishedDate(currentVideo.createdAt)}</span>
          </div>
          {mobilePrimaryActions}
        </div>
      </article>

      <section className="mobile-recommendation-feed" aria-label="Recommended videos">
        <div className="mobile-recommendation-feed__heading">
          <span>Up next</span>
          <strong>Recommended for you</strong>
        </div>
        {mobileFeedVideos.slice(1).map((item) => {
          const itemCreator = item.creatorHandle ? `@${item.creatorHandle}` : 'Samsar creator';
          return (
            <article
              className="mobile-recommendation-card"
              data-mobile-feed-id={item.id}
              key={item.id}
              ref={(element) => { mobileFeedItemRefs.current[item.id] = element; }}
            >
              <div className="mobile-recommendation-card__media">
                <video
                  muted
                  onEnded={() => advanceMobileFeed(item.id)}
                  playsInline
                  poster={item.posterUrl}
                  preload="metadata"
                  ref={(element) => { mobileFeedVideoRefs.current[item.id] = element; }}
                  src={item.videoUrl}
                />
                <a aria-label={`Watch ${item.title}`} href={getVideoPagePath(item.id)}>
                  <Icon name="play" size={20} />
                </a>
              </div>
              <a className="mobile-recommendation-card__copy" href={getVideoPagePath(item.id)}>
                <small>{itemCreator}</small>
                <h2>{item.title}</h2>
                <span>{formatCompactNumber(item.stats.views)} views</span>
              </a>
            </article>
          );
        })}
        {recommendationsLoading ? <div className="mobile-recommendation-feed__state">Finding more videos…</div> : null}
        {!recommendationsLoading && recommendationsError ? (
          <div className="mobile-recommendation-feed__state">Recommendations are temporarily unavailable.</div>
        ) : null}
        {!recommendationsLoading && !recommendationsError && mobileFeedVideos.length === 1 ? (
          <div className="mobile-recommendation-feed__state">No related videos yet.</div>
        ) : null}
      </section>
    </div>
  );

  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareTitle = encodeURIComponent(currentVideo.title);
  const socialShareOptions = useMemo(() => [
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodedShareUrl}&text=${encodedShareTitle}`
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedShareUrl}`
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodedShareTitle}%20${encodedShareUrl}`
    }
  ], [encodedShareTitle, encodedShareUrl]);

  const titleActions = (
    <div className="video-page__title-actions">
      <button
        aria-label={currentVideo.viewerHasLiked ? 'Unlike video' : 'Like video'}
        className={currentVideo.viewerHasLiked ? 'is-active' : ''}
        disabled={!isAuthenticated || isLiking}
        onClick={() => void toggleLike()}
        title={!authReady ? 'Checking sign-in status' : !isAuthenticated ? 'Log in to like this video' : undefined}
        type="button"
      >
        <Icon name="heart" size={20} />
        <span>{formatCompactNumber(currentVideo.stats.likes)}</span>
      </button>
      <div className="video-page__share" ref={shareMenuRef}>
        <button
          aria-controls={shareMenuId}
          aria-expanded={shareMenuOpen}
          aria-haspopup="menu"
          aria-label="Share video"
          onClick={() => setShareMenuOpen((current) => !current)}
          title="Share video"
          type="button"
        >
          <Icon name="share" size={19} />
        </button>
        {shareMenuOpen ? (
          <div className="video-page__share-menu" id={shareMenuId} role="menu">
            <span>Share this video</span>
            <div className="video-page__share-socials">
              {socialShareOptions.map((option) => (
                <a
                  href={option.href}
                  key={option.label}
                  onClick={() => {
                    setShareMenuOpen(false);
                    recordShare();
                  }}
                  rel="noopener noreferrer"
                  role="menuitem"
                  target="_blank"
                >
                  {option.label}
                </a>
              ))}
            </div>
            <button onClick={() => void copyShareLink()} role="menuitem" type="button">
              <Icon name="copy" size={16} />
              Copy link
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const recommendationsPanel = (
    <aside className="video-page__recommendations" aria-label="Recommended videos">
      <div className="video-page__recommendations-heading">
        <strong>More to watch</strong>
      </div>
      {visibleRecommendations.map((item) => (
        <a href={getVideoPagePath(item.id)} key={item.id}>
          <span className="video-page__recommendation-media">
            <video muted playsInline poster={item.posterUrl} preload="none" />
            <span><Icon name="play" size={14} /></span>
          </span>
          <span className="video-page__recommendation-copy">
            <strong>{item.title}</strong>
            <small>{item.creatorHandle ? `@${item.creatorHandle}` : 'Samsar creator'}</small>
            <small>{formatCompactNumber(item.stats.views)} views</small>
          </span>
        </a>
      ))}
      {recommendationsLoading ? (
        <div className="video-page__recommendations-state">Finding the next stories…</div>
      ) : null}
      {!recommendationsLoading && recommendationsError ? (
        <div className="video-page__recommendations-state">Recommendations are temporarily unavailable.</div>
      ) : null}
      {!recommendationsLoading && !recommendationsError && visibleRecommendations.length === 0 ? (
        <div className="video-page__recommendations-state">No related videos yet.</div>
      ) : null}
    </aside>
  );

  const details = (
    <div className="video-page__body">
      <div className="video-page__eyebrow">{creator}</div>
      {desktopSixteenNine || (portrait && !isMobile && portraitDetailsOpen) ? (
        <div className="video-page__title-row">
          <h1>{currentVideo.title}</h1>
          {titleActions}
        </div>
      ) : <h1>{currentVideo.title}</h1>}
      <div className="video-page__meta">
        <span>{formatCompactNumber(currentVideo.stats.views)} views</span>
        <span aria-hidden="true">•</span>
        <span>{formatPublishedDate(currentVideo.createdAt)}</span>
      </div>
      {currentVideo.description ? (
        desktopSixteenNine
          ? <ExpandableVideoDescription description={currentVideo.description} />
          : <p className="video-page__description">{currentVideo.description}</p>
      ) : null}
      {desktopSixteenNine ? (
        <div className="video-comments-inline video-comments-inline--details" ref={commentsSectionRef}>
          {commentsPanel}
        </div>
      ) : null}
      {currentVideo.tags?.length ? (
        <ul className="video-page__tags" aria-label="Video tags">
          {currentVideo.tags.slice(0, 10).map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      ) : null}
      {!portrait && !desktopSixteenNine ? actionButtons : null}
    </div>
  );

  const landscapeMedia = (
    <div className="video-page__media">
      <VideoPageMobileNav />
      <video controls playsInline poster={currentVideo.posterUrl} preload="metadata" src={currentVideo.videoUrl} />
    </div>
  );

  const mobileDescriptionSheet = (
    <div
      className="mobile-description-sheet"
      onClick={(event) => {
        if (event.target === event.currentTarget) setMobileDescriptionOpen(false);
      }}
      role="presentation"
    >
      <section aria-label="Video description" aria-modal="true" className="mobile-description-sheet__panel" role="dialog">
        <span className="mobile-description-sheet__handle" aria-hidden="true" />
        <header>
          <div>
            <small>{creator}</small>
            <strong>About this video</strong>
          </div>
          <button aria-label="Close video description" onClick={() => setMobileDescriptionOpen(false)} type="button">
            <Icon name="close" size={19} />
          </button>
        </header>
        <div className="mobile-description-sheet__scroll">
          <h2>{currentVideo.title}</h2>
          <div className="video-page__meta">
            <span>{formatCompactNumber(currentVideo.stats.views)} views</span>
            <span aria-hidden="true">•</span>
            <span>{formatPublishedDate(currentVideo.createdAt)}</span>
          </div>
          {currentVideo.description ? <p>{currentVideo.description}</p> : <p>No description provided.</p>}
          {currentVideo.tags?.length ? (
            <ul aria-label="Video tags">
              {currentVideo.tags.slice(0, 10).map((tag) => <li key={tag}>{tag}</li>)}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );

  return (
    <article className={`video-page__card video-watch${portrait ? ' video-watch--portrait' : ' video-watch--landscape'}${commentsOpen ? ' video-watch--comments-open' : ''}${portraitDetailsOpen ? ' video-watch--portrait-details-open' : ''}${immersiveMobile ? ' video-watch--mobile-immersive' : ''}${isMobile && isSixteenNine ? ' video-watch--mobile-16x9' : ''}${isMobile && isSixteenNine && mobileLandscape ? ' video-watch--mobile-landscape' : ''}`}>
      {isMobile ? (
        immersiveMobile ? mobileImmersiveFeed : isSixteenNine ? mobileLandscapeView : (
          <>
            {landscapeMedia}
            {details}
          </>
        )
      ) : portrait ? (
        <>
          <div className="video-watch__portrait-layout">
            {!portraitDetailsOpen ? (
              <button
                aria-label="Open video details"
                aria-expanded={portraitDetailsOpen}
                className="video-watch__portrait-summary"
                onClick={() => setPortraitDetailsOpen(true)}
                type="button"
              >
                <span className="video-watch__portrait-summary-copy">
                  <small>{creator}</small>
                  <strong>{currentVideo.title}</strong>
                  {currentVideo.description ? <span>{currentVideo.description}</span> : null}
                  <em>View details <span aria-hidden="true">→</span></em>
                </span>
              </button>
            ) : null}
            <div className="video-watch__portrait-player">
              <div className="video-page__media video-page__media--portrait">
                <VideoPageMobileNav />
                <video
                  autoPlay
                  controls
                  loop
                  muted
                  playsInline
                  poster={currentVideo.posterUrl}
                  preload="metadata"
                  src={currentVideo.videoUrl}
                />
                {actionButtons}
              </div>
            </div>
            <aside
              aria-hidden={!portraitDetailsOpen}
              className="video-watch__portrait-details"
            >
              {portraitDetailsOpen ? (
                <>
                  <div className="video-watch__portrait-details-header">
                    <span>Video details</span>
                    <button
                      aria-label="Close video details"
                      onClick={() => {
                        setCommentsOpen(false);
                        setPortraitDetailsOpen(false);
                      }}
                      type="button"
                    >
                      <Icon name="close" size={19} />
                    </button>
                  </div>
                  <div className="video-watch__portrait-details-scroll">
                    {details}
                    {commentsOpen ? (
                      <div className="video-comments-inline video-watch__portrait-comments" ref={commentsSectionRef}>
                        {commentsPanel}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </aside>
          </div>
        </>
      ) : (
        desktopSixteenNine ? (
          <div className="video-watch__landscape-layout">
            <div className="video-watch__landscape-main">
              {landscapeMedia}
              {details}
            </div>
            {recommendationsPanel}
          </div>
        ) : (
          <>
            {landscapeMedia}
            {details}
            <div className="video-comments-inline" ref={commentsSectionRef}>
              {!isMobile ? commentsPanel : null}
            </div>
          </>
        )
      )}

      {isMobile && commentsOpen ? (
        <div
          className="video-comments-sheet"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCommentsOpen(false);
          }}
          role="presentation"
        >
          <section aria-label="Video comments" aria-modal="true" className="video-comments-sheet__panel" role="dialog">
            <span className="video-comments-sheet__handle" aria-hidden="true" />
            {commentsPanel}
          </section>
        </div>
      ) : null}
      {isMobile && mobileDescriptionOpen ? mobileDescriptionSheet : null}
      {toast ? <div className="video-page-toast" role="status">{toast}</div> : null}
    </article>
  );
}
