import type { AuthenticatedUser } from './types';

const TOKEN_KEY = 'authToken';
const COOKIE_NAME = 'authToken';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const sanitizeToken = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return null;
  }

  return trimmed;
};

const getAvailableStorages = (): Storage[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const storages: Storage[] = [];

  try {
    storages.push(window.sessionStorage);
  } catch {
    // Ignore access issues (e.g. private mode).
  }

  try {
    storages.push(window.localStorage);
  } catch {
    // Ignore access issues (e.g. private mode).
  }

  return storages;
};

const readTokenFromStorage = (): string | null => {
  const storages = getAvailableStorages();

  for (const storage of storages) {
    try {
      const value = sanitizeToken(storage.getItem(TOKEN_KEY));
      if (value) {
        return value;
      }
    } catch {
      // Ignore storage read errors.
    }
  }

  return null;
};

const writeTokenToStorage = (token: string) => {
  const storages = getAvailableStorages();

  for (const storage of storages) {
    try {
      storage.setItem(TOKEN_KEY, token);
    } catch {
      // Ignore storage write errors.
    }
  }
};

const clearTokenFromStorage = () => {
  const storages = getAvailableStorages();

  for (const storage of storages) {
    try {
      storage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage removal errors.
    }
  }
};

export const getExistingAuthToken = (): string | null => {
  const storedToken = readTokenFromStorage();
  if (storedToken) {
    return storedToken;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );

  const cookieToken = match ? sanitizeToken(decodeURIComponent(match[1])) : null;

  if (cookieToken) {
    writeTokenToStorage(cookieToken);
  }

  return cookieToken;
};

export const persistAuthToken = (token: string) => {
  const normalizedToken = sanitizeToken(token);
  if (!normalizedToken) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  writeTokenToStorage(normalizedToken);

  if (typeof document === 'undefined') {
    return;
  }

  const baseCookie = `${COOKIE_NAME}=${encodeURIComponent(
    normalizedToken
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
      normalizedToken
    )}; ${attributes.join('; ')}; max-age=${MAX_AGE_SECONDS}`;
  }

  if (host.endsWith('.samsar.one')) {
    const attrs = ['domain=.samsar.one', 'path=/'];
    if (isSecure) {
      attrs.push('Secure', 'SameSite=None');
    }
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      normalizedToken
    )}; ${attrs.join('; ')}; max-age=${MAX_AGE_SECONDS}`;
  }
};

export const clearAuthToken = () => {
  clearTokenFromStorage();

  if (typeof document === 'undefined') {
    return;
  }

  if (typeof window === 'undefined') {
    return;
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
