import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Mở học — Mỗi ngày một chút',description:'Không gian học tập của bạn. Khám phá khóa học, thực hành và theo dõi từng bước tiến.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
