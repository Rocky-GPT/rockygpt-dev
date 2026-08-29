/**
 * @module app/layout
 * Root layout for the RockyGPT developer control room.
 *
 * Deliberately thinner than the student app's: no PWA manifest, no icon set,
 * and no `viewport` export. That export's `interactiveWidget: 'resizes-visual'`
 * pairs with `lib/visual-viewport`, which measures the strip an on-screen
 * keyboard covers — machinery this app does not lift and does not need.
 */

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/app/globals.css';
import { AppShell } from '@/components/shell/AppShell';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RockyGPT Dev',
  description: 'Inspect the brain, browse campus data, read chat logs, and watch service health.',
  applicationName: 'RockyGPT Dev',
  // Belt and braces with the X-Robots-Tag header. This app renders real
  // student conversations.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
