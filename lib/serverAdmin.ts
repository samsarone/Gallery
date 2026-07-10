import type { NextRequest } from 'next/server';
import type { AuthenticatedUser } from './types';
import { SAMSAR_API_SERVER } from './config';

export const getRequestAuthToken = (request: NextRequest): string | null => {
  const cookieToken = request.cookies.get('authToken')?.value;
  if (cookieToken) return cookieToken;

  const authorization = request.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice(7).trim() || null;
};

export const verifyAdminRequest = async (
  request: NextRequest
): Promise<
  | { ok: true; token: string; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403; message: string }
> => {
  const token = getRequestAuthToken(request);
  if (!token) {
    return { ok: false, status: 401, message: 'Authentication required.' };
  }

  try {
    const response = await fetch(
      `${SAMSAR_API_SERVER}/users/verify_token?authToken=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) {
      return { ok: false, status: 401, message: 'Your session has expired.' };
    }

    const user = (await response.json()) as AuthenticatedUser;
    if (user.isAdminUser !== true) {
      return {
        ok: false,
        status: 403,
        message: 'This area is limited to Samsar administrators.'
      };
    }

    return { ok: true, token, user };
  } catch {
    return { ok: false, status: 401, message: 'Unable to verify your session.' };
  }
};
