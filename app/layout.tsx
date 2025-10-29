import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Samsar Gallery',
  description: 'Discover published Samsar videos in a fluid, infinite masonry gallery experience.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
