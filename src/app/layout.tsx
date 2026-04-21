import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Topshelf Stock",
  description: "Premium Bar Stock Management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

import ThemeRegistry from '@/components/ThemeRegistry';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  let themeMode = 'dark'; // global default

  if (session?.id) {
    try {
      const user = await db.one('SELECT ui_theme, organization_id FROM users WHERE id = $1', [session.id]);
      if (user?.ui_theme) {
        themeMode = user.ui_theme;
      } else if (user?.organization_id) {
        const org = await db.one('SELECT settings FROM organizations WHERE id = $1', [user.organization_id]);
        if (org?.settings?.default_theme) {
          themeMode = org.settings.default_theme;
        }
      }
    } catch (e) {
      console.error('Failed to fetch theme preferences', e);
    }
  }

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={themeMode === 'light' ? '#f3f4f6' : (themeMode === 'blue' ? '#0f172a' : '#111827')} />
        <link rel="icon" href="/icon.png" />
      </head>
      <body className={inter.className}>
        <ThemeRegistry themeMode={themeMode}>
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
