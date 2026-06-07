import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'Nexus - Remote Browser Control',
  description: 'Real-time remote browser control powered by Docker, CDP, and WebSocket streaming. Control a headless Chromium instance directly from your browser.',
  keywords: ['remote browser', 'docker', 'chromium', 'CDP', 'headless browser', 'real-time streaming'],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0e1a" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
