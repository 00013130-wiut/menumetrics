// layout.js (root) — wraps EVERY page in the app.
// Loads the global stylesheet and the two web fonts (Fraunces for headings/logo,
// Inter for body text and numbers), exposing them as CSS variables that
// app/globals.css and Tailwind reference. Sets the browser tab title/description.
import './globals.css';
import { Fraunces, Inter } from 'next/font/google';

// Fraunces — logo, headings, section titles. Inter — body text + all numbers.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fraunces',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'MenuMetrics — Menu Engineering & Waste Analytics',
  description:
    'Multi-restaurant menu engineering, POS sales ingestion and waste analytics built on Next.js + Supabase.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
