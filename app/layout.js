import { Tiro_Devanagari_Hindi, Playfair_Display, Inter } from 'next/font/google';
import './globals.css';

const tiro = Tiro_Devanagari_Hindi({
  subsets: ['devanagari'],
  weight: '400',
  variable: '--font-tiro',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'बापट यंत्र — Maharashtra Noise Pollution Reporter',
  description:
    'महाराष्ट्रातील ध्वनी प्रदूषणाची नोंद करा. DJ आणि ढोल-ताशाचे उल्लंघन नकाशावर दाखवा.',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#f97316',
};

export default function RootLayout({ children }) {
  return (
    <html lang="mr" className={`${tiro.variable} ${playfair.variable} ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
      </head>
      <body className="bg-amber-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
