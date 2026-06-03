import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./logo-fix.css";

const siteUrl = "https://lifeguards.vercel.app";
const version = "V5";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `Lifeguard Schedule ${version}`,
  description: "Lifeguard availability, unique shift requests, AM/PM manager scheduling, admin approval, and printable reporting for Serenity Shores pool.",
  openGraph: {
    title: `Lifeguard Schedule ${version}`,
    description: "Unique lifeguard shift requests, separated AM/PM approvals, schedule gaps, and printable reports.",
    url: siteUrl,
    siteName: `Lifeguard Schedule ${version}`,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `Lifeguard Schedule ${version}` }]
  },
  twitter: {
    card: "summary_large_image",
    title: `Lifeguard Schedule ${version}`,
    description: "Unique lifeguard shift requests, separated AM/PM approvals, schedule gaps, and printable reports.",
    images: ["/opengraph-image"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#075f76"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
