'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export default function VideoPageMobileNav() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [searchOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setSearchOpen(true);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="video-page-mobile-nav">
      <Link className="video-page-mobile-nav__logo" href="/" aria-label="Samsar Gallery home">
        The Gallery
      </Link>

      <form
        className={`video-page-mobile-nav__search${searchOpen ? ' is-open' : ''}`}
        onSubmit={handleSubmit}
        ref={searchRef}
        role="search"
      >
        <button
          aria-expanded={searchOpen}
          aria-label={searchOpen ? 'Submit search' : 'Open search'}
          onClick={(event) => {
            if (searchOpen) return;
            event.preventDefault();
            setSearchOpen(true);
          }}
          type="submit"
        >
          <SearchIcon />
        </button>
        <label className="sr-only" htmlFor="video-page-mobile-search">
          Search videos
        </label>
        <input
          id="video-page-mobile-search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setSearchOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search"
          ref={inputRef}
          type="search"
          value={query}
        />
      </form>
    </div>
  );
}
