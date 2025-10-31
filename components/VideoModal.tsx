/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import VideoOverlayContent from './VideoOverlayContent';

import type {
  PublishedVideo,
  VideoCommentState,
  VideoStats
} from '@/lib/types';

interface VideoModalProps {
  video: PublishedVideo;
  stats: VideoStats;
  viewerHasLiked: boolean;
  comments: VideoCommentState;
  isLiking: boolean;
  isSharing: boolean;
  onToggleLike: (videoId: string) => Promise<void> | void;
  onShare: (video: PublishedVideo) => Promise<void> | void;
  onSubmitComment: (videoId: string, text: string) => Promise<void>;
  onLoadMoreComments: (videoId: string) => Promise<void> | void;
  initialVolume: number;
  initialMuted: boolean;
  onVolumeChange: (volume: number, muted: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

export default function VideoModal({
  video,
  stats,
  viewerHasLiked,
  comments,
  isLiking,
  isSharing,
  onToggleLike,
  onShare,
  onSubmitComment,
  onLoadMoreComments,
  initialVolume,
  initialMuted,
  onVolumeChange,
  onPrevious,
  onNext,
  onClose
}: VideoModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentsExpanded, setCommentsExpanded] = useState<boolean>(false);
  const commentsContentId = useId();
  const [isVideoReady, setIsVideoReady] = useState(false);

  const aspectRatioValue = useMemo(() => {
    if (!video.aspectRatio || typeof video.aspectRatio !== 'string') {
      return null;
    }

    const normalized = video.aspectRatio.replace(/x/gi, ':').replace(/\//g, ':');
    const [rawWidth, rawHeight] = normalized.split(':').map((value) => value.trim());
    const width = Number.parseFloat(rawWidth);
    const height = Number.parseFloat(rawHeight);

    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return `${width} / ${height}`;
    }

    return null;
  }, [video.aspectRatio]);

  const videoContainerStyle = aspectRatioValue ? { aspectRatio: aspectRatioValue } : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  useEffect(() => {
    setCommentText('');
    setCommentError(null);
    setCommentsExpanded(false);
  }, [video.id]);

  useEffect(() => {
    setIsVideoReady(false);
  }, [video.id, video.videoUrl]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    const boundedVolume = Number.isFinite(initialVolume)
      ? Math.min(1, Math.max(0, initialVolume))
      : 0.65;

    element.volume = boundedVolume;
    element.muted = initialMuted;

    const handleVolumeChange = () => {
      if (!videoRef.current) {
        return;
      }
      onVolumeChange(
        videoRef.current.volume,
        videoRef.current.muted
      );
    };

    element.addEventListener('volumechange', handleVolumeChange);
    return () => {
      element.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [initialMuted, initialVolume, onVolumeChange, video.id]);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    try {
      void videoRef.current.play();
    } catch {
      // Autoplay might be blocked; ignore.
    }
  }, [video.id]);

  const handleVideoReady = () => {
    setIsVideoReady(true);
  };

  const handleVideoWaiting = () => {
    if (videoRef.current?.readyState !== undefined && videoRef.current.readyState >= 2) {
      return;
    }
    setIsVideoReady(false);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleLikeClick = async () => {
    await onToggleLike(video.id);
  };

  const handleShareClick = async () => {
    await onShare(video);
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentError('Please enter a comment before sending.');
      return;
    }

    try {
      setCommentError(null);
      await onSubmitComment(video.id, trimmed);
      setCommentText('');
    } catch (error) {
      setCommentError(
        error instanceof Error
          ? error.message
          : 'Failed to post comment. Please try again.'
      );
    }
  };

  const handleToggleComments = () => {
    setCommentsExpanded((previous) => !previous);
  };

  const commentsContainerClassName = `modal__comments${
    commentsExpanded ? ' modal__comments--expanded' : ' modal__comments--collapsed'
  }`;

  const commentsContentClassName = `modal__comments-content${
    commentsExpanded ? ' modal__comments-content--expanded' : ''
  }`;
  const commentsToggleTitle = commentsExpanded
    ? 'Collapse comments'
    : 'Expand comments';
  const showCommentsLoading = comments.isLoading;
  const shouldShowEmptyState =
    !comments.isLoading && comments.items.length === 0 && !comments.error;
  const shouldRenderComments = comments.hasLoadedInitial;

  const handleLoadMore = async () => {
    if (!comments.hasMore || showCommentsLoading || comments.isLoading) {
      return;
    }
    await onLoadMoreComments(video.id);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="modal modal--with-sidebar"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          className="modal__close"
          onClick={onClose}
          aria-label="Close video modal"
          type="button"
        >
          ×
        </button>

        <section className="modal__video" aria-busy={!isVideoReady}>
          <div
            className={`modal__video-inner${
              isVideoReady ? ' modal__video-inner--ready' : ''
            }`}
            style={videoContainerStyle}
          >
            {!isVideoReady && (
              <div className="modal__video-placeholder" aria-hidden="true">
                <div className="modal__video-placeholder-sheen" />
                <div className="modal__video-spinner" />
              </div>
            )}
            <video
              ref={videoRef}
              src={video.videoUrl}
              controls
              autoPlay
              playsInline
              loop
              muted={initialMuted}
              controlsList="nodownload"
              poster=""
              onLoadedData={handleVideoReady}
              onLoadedMetadata={handleVideoReady}
              onCanPlay={handleVideoReady}
              onWaiting={handleVideoWaiting}
            />
          </div>
          {onPrevious && (
            <button
              type="button"
              className="modal__nav-button modal__nav-button--previous"
              onClick={onPrevious}
              aria-label="View previous video"
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          {onNext && (
            <button
              type="button"
              className="modal__nav-button modal__nav-button--next"
              onClick={onNext}
              aria-label="View next video"
            >
              <span aria-hidden="true">›</span>
            </button>
          )}
          <VideoOverlayContent
            variant="modal"
            title={video.title}
            description={video.description}
          />
        </section>

        <aside className="modal__sidebar">
          <header className="modal__header">
            <h2 id="modal-title">{video.title}</h2>
            <p className="modal__creator">
              {video.creatorHandle
                ? `By ${video.creatorHandle}${
                    video.isBotUser ? ' [bot]' : ''
                  }`
                : 'Published video'}
            </p>
          </header>

          <div className="modal__description-block">
            {video.description ? (
              <p className="modal__description">{video.description}</p>
            ) : (
              <p className="modal__description modal__description--muted">
                No description provided.
              </p>
            )}
            {video.originalPrompt && (
              <div className="modal__prompt">
                <h3>Original Prompt</h3>
                <p>{video.originalPrompt}</p>
              </div>
            )}
          </div>

          <div className="modal__actions">
            <button
              type="button"
              className={`modal__action-button${
                viewerHasLiked ? ' modal__action-button--active' : ''
              }`}
              onClick={handleLikeClick}
              disabled={isLiking}
            >
              <span className="modal__action-icon">♥</span>
              <span>{stats.likes.toLocaleString()}</span>
            </button>

            <button
              type="button"
              className="modal__action-button"
              onClick={handleShareClick}
              disabled={isSharing}
            >
              <span className="modal__action-icon">⤴</span>
              <span>{stats.shares.toLocaleString()}</span>
            </button>
          </div>

          {shouldRenderComments ? (
            <div className={commentsContainerClassName}>
              <button
                type="button"
                className="modal__comments-toggle"
                onClick={handleToggleComments}
                aria-expanded={commentsExpanded}
                aria-controls={commentsContentId}
                title={commentsToggleTitle}
              >
                <span className="modal__comments-label">Comments</span>
                <span className="modal__comments-meta">
                  <span className="modal__comments-count">
                    {stats.comments.toLocaleString()}
                  </span>
                  <span className="modal__comments-icon" aria-hidden="true" />
                </span>
              </button>

              {commentsExpanded ? (
                <div id={commentsContentId} className={commentsContentClassName}>
                  {comments.error && (
                    <div className="modal__comments-error">{comments.error}</div>
                  )}

                  <div className="modal__comments-list">
                    {comments.items.map((comment) => (
                      <div className="modal__comment" key={comment.id}>
                        <div className="modal__comment-header">
                          <span className="modal__comment-author">
                            {comment.isBotUser
                              ? `${comment.creatorHandle} [bot]`
                              : comment.creatorHandle}
                          </span>
                          <time
                            dateTime={comment.createdAt}
                            className="modal__comment-time"
                          >
                            {new Date(comment.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p className="modal__comment-text">{comment.text}</p>
                      </div>
                    ))}

                    {showCommentsLoading && (
                      <div className="modal__comments-loader">
                        Loading comments…
                      </div>
                    )}

                    {comments.hasMore && !showCommentsLoading && (
                      <button
                        type="button"
                        className="modal__comments-load-more"
                        onClick={handleLoadMore}
                      >
                        Load more comments
                      </button>
                    )}

                    {shouldShowEmptyState && (
                      <p className="modal__comments-empty">
                        Be the first to leave a comment.
                      </p>
                    )}
                  </div>

                  <form className="modal__comment-form" onSubmit={handleCommentSubmit}>
                    <label htmlFor="modal-comment-input" className="sr-only">
                      Add a comment
                    </label>
                    <input
                      id="modal-comment-input"
                      type="text"
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Add a comment…"
                      disabled={comments.isPosting}
                    />
                    <button
                      type="submit"
                      disabled={comments.isPosting || commentText.trim().length === 0}
                    >
                      {comments.isPosting ? 'Posting…' : 'Post'}
                    </button>
                  </form>

                  {commentError && (
                    <p className="modal__comment-error" role="alert">
                      {commentError}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="modal__comments-loading">
              <div className="modal__comments-loader">Loading comments…</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
