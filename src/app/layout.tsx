import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ground News — Objective Mobile Reader',
  description:
    'Personal objective mobile news reader with Left / Center / Right bias bars, Blindspot detection, and Spin-Free Synthesis.',
  manifest: '/manifest.json',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ground News',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#090D16',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090D16] text-slate-50 antialiased selection:bg-blue-500/30">
        {children}
      </body>
    </html>
  );
}
