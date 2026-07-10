'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import LoginDialog from './LoginDialog';
import type { AuthenticatedUser, PublishedVideo } from '@/lib/types';
import {
  clearAuthToken,
  getExistingAuthToken,
  verifyAuthToken
} from '@/lib/auth';
import { SAMSAR_API_SERVER } from '@/lib/config';
import { parseVideoCollection } from '@/lib/videos';

const resolveDisplayName = (user: AuthenticatedUser | null): string | null => {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const record = user as Record<string, unknown>;

  if (typeof record.username === 'string' && record.username.trim().length > 0) {
    return record.username.trim();
  }

  if (typeof record.email === 'string' && record.email.trim().length > 0) {
    return record.email.trim();
  }

  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    return record.name.trim();
  }

  if (
    typeof record.displayName === 'string' &&
    record.displayName.trim().length > 0
  ) {
    return record.displayName.trim();
  }

  return null;
};

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<'login' | 'register'>('login');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<PublishedVideo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const isVideoPage = pathname.startsWith('/video/');

  const performAuthCheck = useCallback(async () => {
    const token = getExistingAuthToken();

    if (!token) {
      setUser(null);
      setCurrentToken(null);
      setIsAuthLoading(false);
      return;
    }

    if (token === currentToken && user) {
      setIsAuthLoading(false);
      return;
    }

    setIsAuthLoading(true);
    const profile = await verifyAuthToken(token);

    if (profile) {
      setUser(profile);
      setCurrentToken(token);
      setAuthError(null);
    } else {
      clearAuthToken();
      setUser(null);
      setCurrentToken(null);
    }

    setIsAuthLoading(false);
  }, [currentToken, user]);

  useEffect(() => {
    performAuthCheck();
  }, [performAuthCheck]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performAuthCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [performAuthCheck]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }

    const channel = new BroadcastChannel('oauth_channel');
    const handler = () => {
      performAuthCheck();
    };

    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }, [performAuthCheck]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const { body } = document;

    if (isDialogOpen) {
      body.classList.add('no-scroll');
    } else {
      body.classList.remove('no-scroll');
    }

    return () => {
      body.classList.remove('no-scroll');
    };
  }, [isDialogOpen]);

  const displayName = useMemo(() => resolveDisplayName(user), [user]);

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
    setCurrentToken(null);
    setAuthError(null);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('oauth_channel');
      channel.postMessage('logout');
      channel.close();
    }
  };

  const handleOpenDialog = useCallback((view: 'login' | 'register' = 'login') => {
    setDialogView(view);
    setAuthError(null);
    setIsDialogOpen(true);
  }, []);

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setAuthError(null);
    setDialogView('login');
  };

  const handleAuthenticated = useCallback(
    async (profile: AuthenticatedUser, token: string) => {
      setIsDialogOpen(false);

      if (!token) {
        return;
      }

      const nextProfile =
        (profile && Object.keys(profile).length > 0
          ? profile
          : await verifyAuthToken(token)) ?? null;

      if (nextProfile) {
        setUser(nextProfile);
        setCurrentToken(token);
        setAuthError(null);

        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('oauth_channel');
          channel.postMessage('oauth_complete');
          channel.close();
        }
      } else {
        // If verification fails, ensure we clear state so UI reflects unauthenticated status.
        clearAuthToken();
        setUser(null);
        setCurrentToken(null);
        setAuthError('Session expired. Please log in again.');
      }
    },
    []
  );

  const clearExternalError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const updateNavHeight = () => {
      const element = navRef.current;
      if (!element) {
        return;
      }

      const { height } = element.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--top-nav-height',
        `${Math.round(height)}px`
      );
    };

    updateNavHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateNavHeight();
      });
      if (navRef.current) {
        observer.observe(navRef.current);
      }
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateNavHeight);
    return () => {
      window.removeEventListener('resize', updateNavHeight);
    };
  }, []);

  const handleGoogleLogin = useCallback(async (options?: { subscribeToWeeklyNewsletter?: boolean }) => {
    if (typeof window === 'undefined') {
      return;
    }

    setAuthError(null);
    setIsGoogleLoading(true);

    try {
      const url = new URL(
        `${SAMSAR_API_SERVER}/users/google_login`
      );
      url.searchParams.set('origin', window.location.origin);
      if (options?.subscribeToWeeklyNewsletter !== undefined) {
        url.searchParams.set(
          'subscribeToWeeklyNewsletter',
          String(options.subscribeToWeeklyNewsletter)
        );
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Failed to start Google sign-in. Please try again.');
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const loginUrl =
        typeof payload?.loginUrl === 'string' ? payload.loginUrl : null;

      if (!loginUrl) {
        throw new Error('Missing Google sign-in URL.');
      }

      window.location.href = loginUrl;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start Google sign-in.';
      setAuthError(message);
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        handleOpenDialog('login');
        return;
      }

      const detail = event.detail as { view?: 'login' | 'register' } | undefined;
      const requestedView =
        detail?.view === 'register' || detail?.view === 'login'
          ? detail.view
          : 'login';

      handleOpenDialog(requestedView);
    };

    window.addEventListener('samsar:open-auth', handler);
    return () => {
      window.removeEventListener('samsar:open-auth', handler);
    };
  }, [handleOpenDialog]);

  useEffect(() => {
    const syncQueryFromUrl = () => {
      const query = new URLSearchParams(window.location.search).get('q') ?? '';
      setSearchQuery(query);
    };
    syncQueryFromUrl();
    window.addEventListener('popstate', syncQueryFromUrl);
    return () => window.removeEventListener('popstate', syncQueryFromUrl);
  }, []);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setSearchMatches([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(
          `/api/gallery/search?q=${encodeURIComponent(normalizedQuery)}&limit=7`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) throw new Error('Semantic suggestions unavailable');
        setSearchMatches(parseVideoCollection(await response.json()).items.slice(0, 7));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        try {
          const fallbackResponse = await fetch('/api/videos?limit=48', {
            cache: 'no-store',
            signal: controller.signal
          });
          if (!fallbackResponse.ok) throw new Error('Suggestions unavailable');
          const normalized = normalizedQuery.toLowerCase();
          const fallbackMatches = parseVideoCollection(await fallbackResponse.json()).items
            .filter((video) =>
              [video.title, video.description, ...(video.tags ?? [])]
                .some((value) => value.toLowerCase().includes(normalized))
            )
            .slice(0, 7);
          setSearchMatches(fallbackMatches);
        } catch {
          setSearchMatches([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 240);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const navigateToSearch = useCallback((query: string) => {
    const normalized = query.trim();
    if (!normalized) return;
    const params = new URLSearchParams({ q: normalized });
    setSearchQuery(normalized);
    setSearchOpen(false);
    router.push(`/search?${params.toString()}` as Route);
  }, [router]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateToSearch(searchQuery);
  };

  return (
    <>
      <nav
        className={`top-nav${isVideoPage ? ' top-nav--video-page' : ''}`}
        ref={navRef}
      >
        <div className="top-nav__container">
          <Link className="top-nav__brand" href="/" aria-label="Samsar Gallery home">
            <span className="top-nav__brand-lockup">
              <span className="top-nav__brand-overline">
                <span className="top-nav__brand-pulse" aria-hidden="true" />
                samsar / visual library
              </span>
              <span className="top-nav__brand-title">The Gallery</span>
            </span>
          </Link>

          <form className="top-nav-search" onSubmit={handleSearchSubmit} ref={searchRef} role="search">
            <input
              aria-label="Search videos"
              autoComplete="off"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchOpen(false);
                if (event.key === 'Enter') {
                  event.preventDefault();
                  navigateToSearch(searchQuery);
                }
              }}
              placeholder="Search"
              type="search"
              value={searchQuery}
            />
            {searchLoading && <span className="top-nav-search__spinner" aria-hidden="true" />}
            <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>

            {searchOpen && searchQuery.trim().length >= 2 && (
              <div className="top-nav-search__dropdown" aria-label="Search suggestions">
                {searchMatches.map((video) => (
                  <button
                    className="top-nav-search__result"
                    key={video.id}
                    onClick={() => navigateToSearch(video.title)}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                      <path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                    <span>{video.title}</span>
                  </button>
                ))}

                {!searchLoading && searchMatches.length === 0 && (
                  <button
                    className="top-nav-search__result top-nav-search__result--fallback"
                    onClick={() => navigateToSearch(searchQuery)}
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                      <path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                    </svg>
                    <span>Search for “{searchQuery.trim()}”</span>
                  </button>
                )}
              </div>
            )}
          </form>

          <div className="top-nav__actions">
            <a
              href="https://app.samsar.one"
              target="_blank"
              rel="noopener noreferrer"
              className="top-nav__create"
            >
              Create <span>a video</span>
            </a>

            {user ? (
              <>
                {displayName && (
                  <span className="top-nav__user" title={displayName}>
                    {displayName}
                  </span>
                )}
                <button
                  type="button"
                  className="top-nav__button top-nav__button--quiet"
                  onClick={handleLogout}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="top-nav__button"
                onClick={() => handleOpenDialog('login')}
                disabled={isAuthLoading}
              >
                {isAuthLoading ? 'Checking…' : 'Log in'}
              </button>
            )}
          </div>
        </div>
      </nav>

      <LoginDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        onAuthenticated={handleAuthenticated}
        onGoogleLogin={handleGoogleLogin}
        isGoogleLoading={isGoogleLoading}
        externalError={authError}
        onResetExternalError={clearExternalError}
        activeView={dialogView}
        onChangeView={setDialogView}
      />
    </>
  );
}
