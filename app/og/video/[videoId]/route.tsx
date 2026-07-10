/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import { getSessionPosterUrl } from '@/lib/videos';

export const runtime = 'edge';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getPublication = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) return {};
  const publication = payload.publication ?? payload.video ?? payload.data;
  return isRecord(publication) ? publication : payload;
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const isUsableImage = async (url: string | undefined): Promise<string | undefined> => {
  if (!url || url.startsWith('data:')) return url;

  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && contentType.startsWith('image/') ? url : undefined;
  } catch {
    return undefined;
  }
};

const getVideoCardData = async (videoId: string) => {
  try {
    const response = await fetch(
      `https://api.samsar.one/publication/${encodeURIComponent(videoId)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return null;

    const publication = getPublication(await response.json());
    const id = stringValue(publication.id) ?? stringValue(publication._id) ?? videoId;
    const title = stringValue(publication.title) ?? 'Samsar Gallery video';
    const sessionId =
      stringValue(publication.sessionId) ?? stringValue(publication.session_id);
    const poster =
      stringValue(publication.posterUrl) ??
      stringValue(publication.splashImage) ??
      stringValue(publication.splash_image) ??
      stringValue(publication.thumbnailUrl) ??
      stringValue(publication.thumbnail) ??
      getSessionPosterUrl(sessionId);

    return { id, title, poster: await isUsableImage(poster) };
  } catch {
    return null;
  }
};

export async function GET(
  request: Request,
  context: { params: { videoId: string } }
) {
  const data = await getVideoCardData(context.params.videoId);
  const poster = data?.poster ?? new URL('/splash.jpg', request.url).toString();
  const title = data?.title ?? 'Discover videos created with Samsar';

  return new ImageResponse(
    (
      <div
        style={{
          background: '#080808',
          color: '#f7f5f2',
          display: 'flex',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          width: '100%'
        }}
      >
        <img
          alt=""
          src={poster}
          style={{
            height: '100%',
            objectFit: 'cover',
            opacity: 0.56,
            position: 'absolute',
            width: '100%'
          }}
        />
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(8, 8, 8, 0.98) 0%, rgba(8, 8, 8, 0.72) 46%, rgba(8, 8, 8, 0.18) 100%)',
            display: 'flex',
            height: '100%',
            position: 'absolute',
            width: '100%'
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '58px 68px',
            position: 'relative',
            width: '100%'
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: '14px' }}>
            <div
              style={{
                alignItems: 'center',
                background: '#f7f5f2',
                borderRadius: '12px',
                color: '#090909',
                display: 'flex',
                fontSize: '28px',
                fontWeight: 800,
                height: '54px',
                justifyContent: 'center',
                width: '54px'
              }}
            >
              S
            </div>
            <div style={{ fontSize: '30px', fontWeight: 600 }}>Samsar Gallery</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '760px' }}>
            <div style={{ fontSize: '58px', fontWeight: 700, letterSpacing: '-2px', lineHeight: 1.08 }}>
              {title}
            </div>
            <div style={{ color: '#ff8c70', fontSize: '24px', marginTop: '24px' }}>
              Watch on Samsar Gallery
            </div>
          </div>
        </div>
      </div>
    ),
    { height: 630, width: 1200 }
  );
}
