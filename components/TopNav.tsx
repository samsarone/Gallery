'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LoginDialog from './LoginDialog';
import type { AuthenticatedUser } from '@/lib/types';
import {
  clearAuthToken,
  getExistingAuthToken,
  verifyAuthToken
} from '@/lib/auth';

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
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<'login' | 'register'>('login');

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

  const handleOpenDialog = (view: 'login' | 'register' = 'login') => {
    setDialogView(view);
    setAuthError(null);
    setIsDialogOpen(true);
  };

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

  const handleGoogleLogin = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    const apiBase = process.env.API_SERVER;
    if (!apiBase) {
      setAuthError('Google sign-in is unavailable. Please try again later.');
      return;
    }

    setAuthError(null);
    setIsGoogleLoading(true);

    try {
      const url = new URL(
        `${apiBase.replace(/\/$/, '')}/users/google_login`
      );
      url.searchParams.set('origin', window.location.origin);

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

  return (
    <>
      <nav className="top-nav">
        <div className="top-nav__container">
          <div className="top-nav__brand">
            <Link href="/">T2V Gallery</Link>
          </div>

          <div className="top-nav__actions">
            <a
              href="https://app.samsar.one"
              target="_blank"
              rel="noopener noreferrer"
              className="top-nav__link"
            >
              Create your own
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
                  className="top-nav__button"
                  onClick={handleLogout}
                >
                  Log out
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
