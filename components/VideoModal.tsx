'use client';

import { useEffect, useRef } from 'react';
import type { PublishedVideo } from '@/lib/types';

interface VideoModalProps {
  video: PublishedVideo;
  onClose: () => void;
}

export default function VideoModal({ video, onClose }: VideoModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button className="modal__close" onClick={onClose} aria-label="Close video modal">
          ×
        </button>

        <section className="modal__video">
          <video
            src={video.videoUrl}
            controls
            autoPlay
            playsInline
            controlsList="nodownload"
            poster=""
          />
        </section>

        <section className="modal__meta">
          <h2 id="modal-title">{video.title}</h2>
          {video.description && <p className="modal__description">{video.description}</p>}
          {!video.description && !video.originalPrompt && (
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
        </section>
      </div>
    </div>
  );
}
