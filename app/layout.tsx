import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://lifeguards.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Serenity Shores Pool Schedule",
  description: "Lifeguard availability, schedule gaps, admin approval, and printable PDF reporting for Serenity Shores pool.",
  icons: {
    icon: "/serenity-shores-logo.svg",
    apple: "/serenity-shores-logo.svg"
  },
  openGraph: {
    title: "Serenity Shores Pool Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports.",
    url: siteUrl,
    siteName: "Serenity Shores Pool Schedule",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Serenity Shores Table Rock Lake"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Serenity Shores Pool Schedule",
    description: "Lifeguard shift requests, admin approvals, schedule gaps, and printable reports.",
    images: ["/og-image.svg"]
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
