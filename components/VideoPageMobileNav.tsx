'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    router.push(`/search?q=${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="video-page-mobile-nav">
      <Link className="video-page-mobile-nav__back" href="/" aria-label="Back to Gallery">
        <span aria-hidden="true">←</span>
        <span>Gallery</span>
      </Link>

      <form
        className="video-page-mobile-nav__search"
        onSubmit={handleSubmit}
        role="search"
      >
        <button type="submit" aria-label="Submit search">
          <SearchIcon />
        </button>
        <label className="sr-only" htmlFor="video-page-mobile-search">
          Search videos
        </label>
        <input
          id="video-page-mobile-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          type="search"
          value={query}
        />
      </form>
    </div>
  );
}
