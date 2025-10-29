'use client';

import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';

type VideoOverlayVariant = 'modal' | 'mobile';

interface VideoOverlayContentProps {
  title: string;
  description?: string;
  className?: string;
  variant?: VideoOverlayVariant;
}

export default function VideoOverlayContent({
  title,
  description,
  className,
  variant = 'modal'
}: VideoOverlayContentProps) {
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [title, description]);

  useEffect(() => {
    if (!description) {
      setIsOverflowing(false);
      return;
    }

    const element = descriptionRef.current;
    if (!element) {
      return;
    }

    const measureOverflow = () => {
      const current = descriptionRef.current;
      if (!current || expanded) {
        return;
      }
      const hasOverflow = current.scrollHeight - current.clientHeight > 1;
      setIsOverflowing(hasOverflow);
    };

    measureOverflow();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (!expanded) {
          measureOverflow();
        }
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      if (!expanded) {
        measureOverflow();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [description, expanded]);

  const classes = [
    'video-overlay',
    `video-overlay--${variant}`,
    expanded ? 'video-overlay--expanded' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="video-overlay__inner">
        <h3 className="video-overlay__title">{title}</h3>

        {description ? (
          <p
            id={descriptionId}
            ref={descriptionRef}
            className={`video-overlay__description${
              expanded ? ' video-overlay__description--expanded' : ''
            }`}
          >
            {description}
          </p>
        ) : null}

        {description && (isOverflowing || expanded) && (
          <button
            type="button"
            className="video-overlay__toggle"
            onClick={() => setExpanded((previous) => !previous)}
            aria-expanded={expanded}
            aria-controls={descriptionId}
          >
            {expanded ? 'View less' : 'View more'}
          </button>
        )}
      </div>
    </div>
  );
}
