'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  clearAuthToken,
  persistAuthToken,
  verifyAuthToken
} from '@/lib/auth';

type Status = 'pending' | 'success' | 'error';

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyFallback() {
  return <VerifyCard status="pending" message="Verifying your sign-in…" />;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('pending');
  const [message, setMessage] = useState('Verifying your sign-in…');

  useEffect(() => {
    if (!searchParams) {
      return;
    }

    const token = searchParams.get('authToken');
    const redirectCandidate =
      searchParams.get('redirect') ??
      searchParams.get('returnTo') ??
      searchParams.get('next');
    const redirectTarget =
      redirectCandidate && redirectCandidate.startsWith('/')
        ? redirectCandidate
        : '/';

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleRedirect = (destination: string, delay = 900) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        if (typeof window === 'undefined') {
          return;
        }

        const target = new URL(destination, window.location.origin);
        window.location.replace(target.toString());
      }, delay);
    };

    const handleFailure = (errorMessage: string) => {
      clearAuthToken();
      setStatus('error');
      setMessage(errorMessage);
      scheduleRedirect('/', 1800);
    };

    setStatus('pending');
    setMessage('Verifying your sign-in…');

    if (!token) {
      handleFailure('Missing authentication token. Please try logging in again.');
      return () => {
        cancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }

    const verify = async () => {
      try {
        const profile = await verifyAuthToken(token);

        if (cancelled) {
          return;
        }

        if (!profile) {
          throw new Error('Verification response did not include a profile.');
        }

        persistAuthToken(token);

        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('oauth_channel');
          channel.postMessage('oauth_complete');
          channel.close();
        }

        setStatus('success');
        setMessage('Verification complete. Redirecting you to the gallery…');
        scheduleRedirect(redirectTarget, 900);
      } catch (error) {
        console.warn('Failed to verify auth token on /verify:', error);
        if (cancelled) {
          return;
        }

        handleFailure('We could not verify your sign-in. Please try logging in again.');
      }
    };

    verify();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [searchParams]);

  return <VerifyCard status={status} message={message} />;
}

function VerifyCard({
  status,
  message
}: {
  status: Status;
  message: string;
}) {
  return (
    <main className="verify-page">
      <div className="verify-card" role="status" aria-live="polite">
        {status === 'pending' && (
          <div className="verify-indicator" aria-hidden="true" />
        )}
        {status === 'success' && (
          <div
            className="verify-indicator verify-indicator--success"
            aria-hidden="true"
          >
            ✓
          </div>
        )}
        {status === 'error' && (
          <div
            className="verify-indicator verify-indicator--error"
            aria-hidden="true"
          >
            !
          </div>
        )}

        <h1 className="verify-heading">Completing sign-in</h1>
        <p className="verify-message">{message}</p>

        {status === 'error' && (
          <Link href="/" className="verify-link">
            Return to gallery
          </Link>
        )}
      </div>
    </main>
  );
}
