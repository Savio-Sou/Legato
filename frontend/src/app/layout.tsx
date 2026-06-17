import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the wordmark + hero headlines. UI/body text stays Geist;
// exposed as --font-display via globals.css @theme (→ the `font-display` utility).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

// Set NEXT_PUBLIC_SITE_URL to the deployed origin so og:image URLs resolve
// absolutely; falls back to localhost for dev.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const description =
  "Private payroll that flows — ZK-verified salaries, paid in pathUSD on Tempo.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Legato — Private Payroll",
  description,
  openGraph: {
    title: "Legato — Private Payroll",
    description,
    siteName: "Legato",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Legato — Private Payroll",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-neutral-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
