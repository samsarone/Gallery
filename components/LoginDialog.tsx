'use client';

import {
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { AuthenticatedUser } from '@/lib/types';
import { persistAuthToken } from '@/lib/auth';

type AuthView = 'login' | 'register';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthenticatedUser, token: string) => void;
  onGoogleLogin?: () => Promise<void> | void;
  isGoogleLoading?: boolean;
  externalError?: string | null;
  onResetExternalError?: () => void;
  activeView?: AuthView;
  onChangeView?: (view: AuthView) => void;
}

const DEFAULT_VIEW: AuthView = 'login';

const normalizeUserPayload = (payload: unknown): {
  user: AuthenticatedUser | null;
  token: string | null;
} => {
  if (!payload || typeof payload !== 'object') {
    return { user: null, token: null };
  }

  const recordPayload = payload as Record<string, unknown>;
  const nested = recordPayload?.data;
  const nestedRecord =
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>)
      : null;

  const token =
    typeof recordPayload.authToken === 'string'
      ? recordPayload.authToken
      : typeof nestedRecord?.authToken === 'string'
      ? (nestedRecord.authToken as string)
      : null;

  if (nestedRecord && Object.keys(nestedRecord).length > 0) {
    const { authToken: _ignored, ...rest } = nestedRecord;
    return {
      token,
      user: rest as AuthenticatedUser
    };
  }

  const { authToken: _stripped, ...rest } = recordPayload;
  return {
    token,
    user: rest as AuthenticatedUser
  };
};

export default function LoginDialog({
  open,
  onClose,
  onAuthenticated,
  onGoogleLogin,
  isGoogleLoading = false,
  externalError = null,
  onResetExternalError,
  activeView,
  onChangeView
}: LoginDialogProps) {
  const [internalView, setInternalView] = useState<AuthView>(DEFAULT_VIEW);
  const currentView = activeView ?? internalView;

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiBase = process.env.API_SERVER;

  useEffect(() => {
    if (!open) {
      setLoginEmail('');
      setLoginPassword('');
      setRegisterUsername('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setError(null);
      onResetExternalError?.();
      if (!activeView) {
        setInternalView(DEFAULT_VIEW);
      }
    }
  }, [open, activeView, onResetExternalError]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleViewChange = (view: AuthView) => {
    if (view === currentView) {
      return;
    }

    setError(null);
    onResetExternalError?.();

    if (onChangeView) {
      onChangeView(view);
    } else {
      setInternalView(view);
    }
  };

  const handleLoginSubmit = async () => {
    if (!apiBase) {
      throw new Error('Login is unavailable. Please try again later.');
    }

    const endpoint = `${apiBase.replace(/\/$/, '')}/users/login`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    });

    if (!response.ok) {
      let message = 'Unable to log in with the provided credentials.';
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody === 'object') {
          const errorRecord = errorBody as Record<string, unknown>;
          if (typeof errorRecord.message === 'string') {
            message = errorRecord.message;
          }
        }
      } catch {
        // Ignore JSON parse issues and fall back to default message.
      }

      throw new Error(message);
    }

    const payload = await response.json();
    const { user, token } = normalizeUserPayload(payload);

    if (!token) {
      throw new Error('Missing auth token in response.');
    }

    persistAuthToken(token);
    onAuthenticated(user ?? {}, token);
    onClose();
  };

  const handleRegisterSubmit = async () => {
    if (!apiBase) {
      throw new Error('Registration is unavailable. Please try again later.');
    }

    const username = registerUsername.trim();
    const email = registerEmail.trim();
    const password = registerPassword;
    const confirmPassword = registerConfirmPassword;

    if (!username || !email || !password || !confirmPassword) {
      throw new Error('All fields are required.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const endpoint = `${apiBase.replace(/\/$/, '')}/users/register`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });

    if (!response.ok) {
      let message = 'Unable to create account at this time.';
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody === 'object') {
          const errorRecord = errorBody as Record<string, unknown>;
          if (typeof errorRecord.message === 'string') {
            message = errorRecord.message;
          }
        }
      } catch {
        // Ignore JSON parse issues and fall back to default message.
      }

      throw new Error(message);
    }

    const payload = await response.json();
    const { user, token } = normalizeUserPayload(payload);

    if (!token) {
      throw new Error('Missing auth token in response.');
    }

    try {
      window.localStorage.setItem('setShowSetPaymentFlow', 'true');
    } catch {
      // Ignore storage errors.
    }

    persistAuthToken(token);
    onAuthenticated(user ?? {}, token);
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!apiBase) {
      setError(
        currentView === 'login'
          ? 'Login is unavailable. Please try again later.'
          : 'Registration is unavailable. Please try again later.'
      );
      return;
    }

    onResetExternalError?.();
    setIsSubmitting(true);
    setError(null);

    try {
      if (currentView === 'login') {
        await handleLoginSubmit();
      } else {
        await handleRegisterSubmit();
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Unexpected error. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onClose();
  };

  const errorMessages = useMemo(() => {
    const messages: string[] = [];

    if (externalError) {
      messages.push(externalError);
    }

    if (error && error !== externalError) {
      messages.push(error);
    }

    return messages;
  }, [error, externalError]);

  const googleButtonLabel =
    currentView === 'login' ? 'Continue with Google' : 'Sign up with Google';
  const submitButtonLabel =
    currentView === 'login' ? 'Sign in' : 'Create account';

  if (!open) {
    return null;
  }

  const handleDialogClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleGoogleClick = async () => {
    if (!onGoogleLogin) {
      return;
    }

    setError(null);
    onResetExternalError?.();

    try {
      if (currentView === 'register') {
        try {
          window.localStorage.setItem('setShowSetPaymentFlow', 'true');
        } catch {
          // Ignore storage errors.
        }
      }

      await onGoogleLogin();
    } catch (googleError) {
      const message =
        googleError instanceof Error
          ? googleError.message
          : 'Unable to start Google sign-in.';
      setError(message);
    }
  };

  return (
    <div className="auth-modal" onClick={handleOverlayClick}>
      <div
        className="auth-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onClick={handleDialogClick}
      >
        <div className="auth-modal__header">
          <h2 id="auth-dialog-title">
            {currentView === 'login' ? 'Welcome back' : 'Join Samsar'}
          </h2>
          <button
            type="button"
            className="auth-modal__close-button"
            onClick={onClose}
            aria-label="Close authentication dialog"
          >
            ×
          </button>
        </div>

        <div className="auth-modal__tabs" role="tablist" aria-label="Auth modes">
          <button
            type="button"
            className={`auth-modal__tab${
              currentView === 'login' ? ' auth-modal__tab--active' : ''
            }`}
            role="tab"
            aria-selected={currentView === 'login'}
            onClick={() => handleViewChange('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-modal__tab${
              currentView === 'register' ? ' auth-modal__tab--active' : ''
            }`}
            role="tab"
            aria-selected={currentView === 'register'}
            onClick={() => handleViewChange('register')}
          >
            Sign up
          </button>
        </div>

        <div className="auth-modal__social">
          <button
            type="button"
            className="auth-modal__google"
            onClick={handleGoogleClick}
            disabled={isSubmitting || isGoogleLoading}
          >
            {isGoogleLoading ? 'Redirecting…' : googleButtonLabel}
          </button>
        </div>

        <div className="auth-modal__separator" role="separator">
          <span>or continue with email</span>
        </div>

        {errorMessages.length > 0 && (
          <div className="auth-modal__error-group" role="alert">
            {errorMessages.map((message, index) => (
              <p key={`auth-error-${index}`} className="auth-modal__error">
                {message}
              </p>
            ))}
          </div>
        )}

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          {currentView === 'login' ? (
            <>
              <label className="auth-modal__label">
                Email
                <input
                  type="email"
                  name="login-email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="auth-modal__input"
                  placeholder="you@example.com"
                />
              </label>

              <label className="auth-modal__label">
                Password
                <input
                  type="password"
                  name="login-password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="auth-modal__input"
                  placeholder="Enter your password"
                />
              </label>
            </>
          ) : (
            <>
              <label className="auth-modal__label">
                Username
                <input
                  type="text"
                  name="register-username"
                  value={registerUsername}
                  onChange={(event) =>
                    setRegisterUsername(event.target.value)
                  }
                  autoComplete="username"
                  required
                  className="auth-modal__input"
                  placeholder="Choose a username"
                />
              </label>

              <label className="auth-modal__label">
                Email
                <input
                  type="email"
                  name="register-email"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="auth-modal__input"
                  placeholder="you@example.com"
                />
              </label>

              <label className="auth-modal__label">
                Password
                <input
                  type="password"
                  name="register-password"
                  value={registerPassword}
                  onChange={(event) =>
                    setRegisterPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  required
                  className="auth-modal__input"
                  placeholder="Create a password"
                />
              </label>

              <label className="auth-modal__label">
                Confirm password
                <input
                  type="password"
                  name="register-confirm-password"
                  value={registerConfirmPassword}
                  onChange={(event) =>
                    setRegisterConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  required
                  className="auth-modal__input"
                  placeholder="Confirm your password"
                />
              </label>
            </>
          )}

          <button
            type="submit"
            className="auth-modal__submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Please wait…' : submitButtonLabel}
          </button>
        </form>

        <div className="auth-modal__footer">
          {currentView === 'login' ? (
            <a
              href="https://app.samsar.one/forgot_password"
              target="_blank"
              rel="noopener noreferrer"
            >
              Forgot your password?
            </a>
          ) : (
            <span className="auth-modal__footer-text">
              By continuing you agree to our{' '}
              <a
                href="https://samsar.one/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms
              </a>{' '}
              and{' '}
              <a
                href="https://samsar.one/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </span>
          )}
        </div>

        <div className="auth-modal__switch">
          {currentView === 'login' ? (
            <>
              <span>New to Samsar?</span>
              <button
                type="button"
                onClick={() => handleViewChange('register')}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              <span>Already have an account?</span>
              <button type="button" onClick={() => handleViewChange('login')}>
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
