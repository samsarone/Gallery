/* eslint-disable jsx-a11y/media-has-caption */
'use client';

import {
  FormEvent,
  useEffect,
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
  onEnsureComments: (videoId: string) => Promise<void> | void;
  initialVolume: number;
  initialMuted: boolean;
  onVolumeChange: (volume: number, muted: boolean) => void;
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
  onEnsureComments,
  initialVolume,
  initialMuted,
  onVolumeChange,
  onClose
}: VideoModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    onEnsureComments(video.id);
  }, [onEnsureComments, video.id]);

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

  const handleLoadMore = async () => {
    if (!comments.hasMore || comments.isLoading) {
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

        <section className="modal__video">
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
          />
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

          <div className="modal__comments">
            <div className="modal__comments-header">
              <h3>Comments</h3>
              <span>{stats.comments.toLocaleString()}</span>
            </div>

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

              {comments.isLoading && (
                <div className="modal__comments-loader">Loading comments…</div>
              )}

              {comments.hasMore && !comments.isLoading && (
                <button
                  type="button"
                  className="modal__comments-load-more"
                  onClick={handleLoadMore}
                >
                  Load more comments
                </button>
              )}

              {!comments.isLoading && comments.items.length === 0 && (
                <p className="modal__comments-empty">
                  Be the first to leave a comment.
                </p>
              )}
            </div>
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
        </aside>
      </div>
    </div>
  );
}
