import type { Metadata } from 'next';
import './globals.css';
import './dashboard-charts.css';

export const metadata: Metadata = {
  title: 'Mở học — Mỗi ngày một chút',
  description: 'Không gian học tập của bạn. Khám phá khóa học, thực hành và theo dõi từng bước tiến.',
  icons: { icon: '/favicon.svg' },
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
