import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

// Open Sans is the typeface used in the prospect's current experience.
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cool places to eat!",
  description:
    "Restaurant search and discovery prototype built on Algolia, for OpenTable.",
};

// Read the env var directly rather than importing from lib/algolia: the
// preconnect is an optimisation, and it should not be able to break /old, which
// does not use Algolia at all.
const algoliaAppId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <head>
        {/*
          Do the TLS handshake with Algolia at page load rather than on the first
          keystroke. Without it the first search pays for several round trips,
          which is exactly the moment latency is most visible.
        */}
        {algoliaAppId && (
          <link
            rel="preconnect"
            href={`https://${algoliaAppId}-dsn.algolia.net`}
            crossOrigin=""
          />
        )}
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
