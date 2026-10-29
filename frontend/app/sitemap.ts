import type { MetadataRoute } from "next";
import { guides } from "./lib/guides";
import { siteConfig } from "./lib/site";

// lastModified is per page and should move only when that page's copy
// changes: Google stops trusting lastmod once every URL shares one date.
// The HTML /sitemap page and per-device /history are left out on purpose.
const routes = [
  { path: "", priority: 1, changeFrequency: "weekly", lastModified: "2026-10-29" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-09-01" },
  { path: "/instructions", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-06" },
  { path: "/about", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-29" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-29" },
  ...guides.map(({ path, lastModified }) => ({
    path,
    priority: 0.8,
    changeFrequency: "monthly" as const,
    lastModified,
  })),
  { path: "/contact", priority: 0.4, changeFrequency: "yearly", lastModified: "2026-09-26" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-09-26" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-09-26" },
  { path: "/refund", priority: 0.2, changeFrequency: "yearly", lastModified: "2026-09-26" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(({ path, priority, changeFrequency, lastModified }) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: new Date(lastModified),
    changeFrequency,
    priority,
    ...(path === ""
      ? { images: [`${siteConfig.url}/opengraph-image`] }
      : {}),
  }));
}
