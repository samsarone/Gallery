import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchPublicVideo } from '@/lib/publicVideo';
import { getSiteUrl, getVideoPagePath } from '@/lib/site';
import { isPortraitVideo } from '@/lib/videos';
import VideoPageExperience from '@/components/VideoPageExperience';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type VideoPageProps = {
  params: {
    videoId: string;
  };
};

const getVideoDescription = (description: string, title: string): string => {
  const normalized = description.trim();
  if (normalized) return normalized.slice(0, 160);
  return `Watch ${title} on Samsar Gallery.`;
};

const getOgImageUrl = (videoId: string): string =>
  new URL(`/og/video/${encodeURIComponent(videoId)}`, getSiteUrl()).toString();

export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  try {
    const video = await fetchPublicVideo(params.videoId);
    if (!video) {
      return {
        title: 'Video not found | Samsar Gallery',
        description: 'This Samsar Gallery video is no longer available.'
      };
    }

    const title = `${video.title} | Samsar Gallery`;
    const description = getVideoDescription(video.description, video.title);
    const url = new URL(getVideoPagePath(video.id), getSiteUrl()).toString();
    const image = getOgImageUrl(video.id);

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        siteName: 'Samsar Gallery',
        type: 'video.other',
        videos: [{ url: video.videoUrl, type: 'video/mp4' }],
        images: [{ url: image, width: 1200, height: 630, alt: `${video.title} — Samsar Gallery` }]
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image]
      }
    };
  } catch {
    return {
      title: 'Samsar Gallery video',
      description: 'Watch videos created by the Samsar community.'
    };
  }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const video = await fetchPublicVideo(params.videoId);
  if (!video) notFound();

  const portrait = isPortraitVideo(video);
  const creator = video.creatorHandle ? `@${video.creatorHandle}` : 'Samsar creator';
  const canonicalUrl = new URL(getVideoPagePath(video.id), getSiteUrl()).toString();
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: getVideoDescription(video.description, video.title),
    thumbnailUrl: video.posterUrl ? [video.posterUrl] : undefined,
    uploadDate: video.createdAt ?? undefined,
    contentUrl: video.videoUrl,
    url: canonicalUrl,
    publisher: {
      '@type': 'Organization',
      name: 'Samsar Gallery',
      url: getSiteUrl()
    }
  }).replace(/</g, '\\u003c');

  return (
    <main className="video-page page-shell">
      <script
        dangerouslySetInnerHTML={{ __html: structuredData }}
        type="application/ld+json"
      />
      <div className="video-page__shell">
        <div className="video-page__breadcrumb">
          <Link href="/">← Gallery</Link>
        </div>

        <VideoPageExperience creator={creator} portrait={portrait} video={video} />
      </div>
    </main>
  );
}
