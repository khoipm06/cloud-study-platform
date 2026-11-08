import type { Metadata } from 'next';
import './globals.css';
import './learning.css';
import './completion.css';
import './dashboard-charts.css';
import './marketplace.css';

export const metadata: Metadata = {
  title: 'Cloud study platform',
  description: 'Không gian học tập của bạn. Khám phá khóa học, thực hành và theo dõi từng bước tiến.',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Cloud study platform',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="stylesheet" href="/fonts/typography.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
