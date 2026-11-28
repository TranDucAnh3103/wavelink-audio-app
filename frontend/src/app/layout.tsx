import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Nunito, Baloo_2, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { AppProviders } from './providers';
import { ClientShell } from './client-shell';
import { getSiteUrl } from '@/lib/siteConfig';

const nunito = Nunito({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap',
});

const baloo2 = Baloo_2({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-comic',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-mono',
  display: 'swap',
});

const siteUrl = getSiteUrl();
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  title: {
    default: 'WaveLink - Nền tảng nghe Audio từ YouTube, Chạy ngầm khi tắt màn hình',
    template: '%s | WaveLink Audio',
  },
  description:
    'Nghe trọn vẹn audio từ video YouTube khi tắt màn hình, tiết kiệm pin và dữ liệu. Tìm kiếm và thưởng thức sách nói, podcast, talkshow, bài hát từ link YouTube nhanh chóng trên WaveLink.',
  keywords: [
    'nghe audio youtube',
    'audio youtube tắt màn hình',
    'phát nhạc youtube chạy ngầm',
    'sách nói youtube',
    'podcast youtube việt nam',
    'youtube to audio',
    'wavelink audio app',
  ],
  authors: [{ name: 'WaveLink Team', url: siteUrl }],
  creator: 'WaveLink',
  publisher: 'WaveLink',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/wavelink-icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: siteUrl,
    siteName: 'WaveLink Audio',
    title: 'WaveLink - Nghe Audio Video YouTube Tắt Màn Hình',
    description:
      'Trải nghiệm nghe audio từ YouTube tiện lợi không bị gián đoạn, hỗ trợ hẹn giờ tắt và điều khiển màn hình khóa.',
    images: [
      {
        url: '/wavelink-icon.png',
        width: 512,
        height: 512,
        alt: 'WaveLink Audio Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WaveLink - Nghe Audio Video YouTube Tắt Màn Hình',
    description:
      'Tìm kiếm và nghe audio từ video YouTube mượt mà, hỗ trợ phát ngầm và hẹn giờ trên điện thoại.',
    images: ['/wavelink-icon.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F5F0' },
    { media: '(prefers-color-scheme: dark)', color: '#141418' },
  ],
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('setting_theme');var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark','dark-comic');}else{r.classList.remove('dark','dark-comic');}var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',d?'#141418':'#F6F5F0');}var isWv=Boolean(window.ReactNativeWebView)||/\\bwv\\b|; wv\\)|FBAN|FBAV|Zalo|Line\\/|Instagram/i.test(navigator.userAgent||'');if(isWv){r.classList.add('wavelink-mobile-webview');var vp=document.querySelector('meta[name="viewport"]');if(vp){vp.setAttribute('content','width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');}}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`h-full ${nunito.variable} ${baloo2.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://img.youtube.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <link rel="dns-prefetch" href="https://img.youtube.com" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex flex-col min-h-screen antialiased">
        <AppProviders>
          <ClientShell>{children}</ClientShell>
        </AppProviders>
      </body>
    </html>
  );
}
