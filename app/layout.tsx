import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./logo-fix.css";

const siteUrl = "https://lifeguards.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Lifeguard Schedule",
  description: "Lifeguard availability, schedule gaps, admin approval, and printable PDF reporting for Serenity Shores pool.",
  openGraph: {
    title: "Lifeguard Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports.",
    url: siteUrl,
    siteName: "Lifeguard Schedule",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Lifeguard Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports."
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
