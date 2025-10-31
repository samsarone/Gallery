import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const metadataBase = siteUrl ? new URL(siteUrl) : undefined;
const ogTitle = 'SamsarOne T2V Gallery';
const ogDescription = 'Explore creations made public by the creators.';

export const metadata: Metadata = {
  metadataBase,
  title: ogTitle,
  description: ogDescription,
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png'
  },
  openGraph: {
    title: ogTitle,
    description: ogDescription,
    url: siteUrl,
    siteName: ogTitle,
    type: 'website',
    images: [
      {
        url: '/splash.jpg',
        width: 1200,
        height: 630,
        alt: 'SamsarOne T2V Gallery splash image'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: ogTitle,
    description: ogDescription,
    images: ['/splash.jpg']
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
