import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Barlow, Alfa_Slab_One } from 'next/font/google';
import './globals.css';

const display = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body    = Barlow({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-body', display: 'swap' });
const slab    = Alfa_Slab_One({ weight: '400', subsets: ['latin'], variable: '--font-slab', display: 'swap' });

export const metadata: Metadata = {
  title: 'The Beer Game — Supply Chain Showdown',
  description: 'A multiplayer supply chain simulation to experience the Bullwhip Effect. Play with your team or jump into Express Mode.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b6340',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${slab.variable}`}>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
