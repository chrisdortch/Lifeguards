import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Lifeguard Schedule V4",
  description: "Serenity Shores Lifeguard Schedule V4 — request shifts, view the approved calendar, and manage the pool schedule.",
  openGraph: {
    title: "Lifeguard Schedule V4",
    description: "Serenity Shores Lifeguard Schedule V4 — request shifts and view the approved calendar.",
    type: "website",
    url: "https://lifeguards.vercel.app/v4",
    images: [{ url: "/v4/opengraph-image", width: 1200, height: 630, alt: "Lifeguard Schedule V4" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lifeguard Schedule V4",
    description: "Serenity Shores Lifeguard Schedule V4 — request shifts and view the approved calendar.",
    images: ["/v4/opengraph-image"],
  },
};

export default function V4Layout({ children }: { children: ReactNode }) {
  return children;
}
