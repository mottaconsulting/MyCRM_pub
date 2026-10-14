import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const display = Fredoka({
  subsets: ["latin"],
  variable: "--font-rounded",
  display: "swap",
});

const text = Nunito({
  subsets: ["latin"],
  variable: "--font-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyCRM",
  description: "Personal CRM for consultants",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "MyCRM", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#7a76dd",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${text.variable}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
