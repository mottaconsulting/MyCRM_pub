import type { MetadataRoute } from "next";

/**
 * PWA web manifest. Drives the Android "install app" experience — the launcher
 * icon and the splash screen (which uses background_color + the 512px icon).
 * The maskable icon is full-bleed so Android's icon mask (circle / squircle)
 * doesn't clip the logo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyCRM",
    short_name: "MyCRM",
    description: "Personal CRM for consultants",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3fb",
    theme_color: "#7a76dd",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
