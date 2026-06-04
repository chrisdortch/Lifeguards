import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./logo-fix.css";
import "./v6.css";

const siteUrl = "https://lifeguards.vercel.app";
const version = "V6";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `Lifeguard Schedule ${version}`,
  description: "Lifeguard availability, AM/MID/PM shift requests, safe pending-request clearing, admin navigation, and printable reporting for Serenity Shores pool.",
  openGraph: {
    title: `Lifeguard Schedule ${version}`,
    description: "AM, MID, and PM shift requests with safer admin tools and section navigation.",
    url: siteUrl,
    siteName: `Lifeguard Schedule ${version}`,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `Lifeguard Schedule ${version}` }]
  },
  twitter: {
    card: "summary_large_image",
    title: `Lifeguard Schedule ${version}`,
    description: "AM, MID, and PM shift requests with safer admin tools and section navigation.",
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
