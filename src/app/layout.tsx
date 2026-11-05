import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

/**
 * Editorial Luxe type trio (all SIL Open Font License, served via next/font):
 *   Fraunces  — high-contrast display serif (variable: optical size + SOFT),
 *               page/section titles, big moments, the wordmark, italic accents
 *   Inter     — quiet grotesk for UI and body copy
 *   IBM Plex Mono — numbers, dates, data, tracked section labels
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Personal OS",
  description: "Your life, on one dashboard.",
};

/**
 * Runs before first paint: resolves the saved theme (or the OS preference)
 * onto <html data-theme> so neither mode ever flashes the other.
 */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("pos-theme");if(t!=="day"&&t!=="night"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"day":"night"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="night"}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
