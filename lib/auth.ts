import type { AuthenticatedUser } from './types';

const TOKEN_KEY = 'authToken';
const COOKIE_NAME = 'authToken';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const getExistingAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Ignore storage errors (quota, private mode, etc.)
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );

  return match ? decodeURIComponent(match[1]) : null;
};

export const persistAuthToken = (token: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }

  if (typeof document === 'undefined') {
    return;
  }

  const baseCookie = `${COOKIE_NAME}=${encodeURIComponent(
    token
  )}; path=/; max-age=${MAX_AGE_SECONDS}`;
  document.cookie = baseCookie;

  const host = window.location.hostname;
  const isSecure = window.location.protocol === 'https:';

  if (host && host.includes('.')) {
    const attributes = [
      `domain=.${host.split('.').slice(-2).join('.')}`,
      'path=/'
    ];
    if (isSecure) {
      attributes.push('Secure', 'SameSite=None');
    }
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      token
    )}; ${attributes.join('; ')}; max-age=${MAX_AGE_SECONDS}`;
  }

  if (host.endsWith('.samsar.one')) {
    const attrs = ['domain=.samsar.one', 'path=/'];
    if (isSecure) {
      attrs.push('Secure', 'SameSite=None');
    }
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      token
    )}; ${attrs.join('; ')}; max-age=${MAX_AGE_SECONDS}`;
  }
};

export const clearAuthToken = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }

  const expireCookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  document.cookie = expireCookie;

  const host = window.location.hostname;
  const isSecure = window.location.protocol === 'https:';

  if (host && host.includes('.')) {
    const attributes = [
      `domain=.${host.split('.').slice(-2).join('.')}`,
      'path=/'
    ];
    if (isSecure) {
      attributes.push('Secure', 'SameSite=None');
    }
    document.cookie = `${COOKIE_NAME}=; ${attributes.join('; ')}; max-age=0`;
  }

  if (host.endsWith('.samsar.one')) {
    const attrs = ['domain=.samsar.one', 'path=/'];
    if (isSecure) {
      attrs.push('Secure', 'SameSite=None');
    }
    document.cookie = `${COOKIE_NAME}=; ${attrs.join('; ')}; max-age=0`;
  }
};

export const verifyAuthToken = async (
  token: string
): Promise<AuthenticatedUser | null> => {
  if (!token) {
    return null;
  }

  const apiBase = process.env.API_SERVER;
  if (!apiBase) {
    console.warn('Missing API_SERVER environment variable.');
    return null;
  }

  const endpoint = `${apiBase.replace(/\/$/, '')}/users/verify_token?authToken=${encodeURIComponent(
    token
  )}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as AuthenticatedUser;
    return user;
  } catch (error) {
    console.warn('Failed to verify auth token:', error);
    return null;
  }
};
