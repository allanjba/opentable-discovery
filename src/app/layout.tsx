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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
