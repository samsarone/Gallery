export type GalleryViewEventType = 'view' | 'progress' | 'complete';

interface GalleryViewEventInput {
  publicationId: string;
  eventType: GalleryViewEventType;
  watchTimeMs: number;
  durationMs: number;
  source: string;
  metadata?: Record<string, unknown>;
  authToken?: string | null;
}

const normalizeMilliseconds = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export const recordGalleryViewEvent = async ({
  publicationId,
  eventType,
  watchTimeMs,
  durationMs,
  source,
  metadata = {},
  authToken
}: GalleryViewEventInput): Promise<number | null> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch('/api/gallery/view', {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify({
      publicationId,
      eventType,
      watchTimeMs: normalizeMilliseconds(watchTimeMs),
      durationMs: normalizeMilliseconds(durationMs),
      source,
      metadata
    }),
    keepalive: true
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const views = payload?.stats?.views;
  return typeof views === 'number' && Number.isFinite(views)
    ? Math.max(0, views)
    : null;
};
