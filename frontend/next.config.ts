import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Keep generated output isolated from legacy local development caches.
  distDir: ".next-build",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async redirects() {
    // Common misspellings of the brand, kept as permanent
    // redirects onto the homepage.
    const spellingRedirects = ["/emogul", "/omogul", "/emogle", "/emoogle"].map(
      (source) => ({
        source,
        destination: "/",
        permanent: true,
      }),
    );

    // Host canonicalisation. This deployment answers on the apex
    // domain, on www, and on the .vercel.app domain, and every
    // page declares a single canonical URL. Serving identical HTML
    // on all three splits ranking signals and makes Search Console
    // report the non-canonical hosts as "Alternate page with proper
    // canonical tag" - indexing none of them. Sending the aliases
    // to the apex leaves exactly one indexable host.
    //
    // These live here rather than in proxy.ts because the proxy
    // matcher deliberately skips /robots.txt and /sitemap.xml,
    // which must be canonicalised too.
    const aliasHosts = ["www.emoggle.com", "emoggle.vercel.app"];
    const hostRedirects = aliasHosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://emoggle.com/:path*",
      permanent: true,
    }));

    return [...hostRedirects, ...spellingRedirects];
  },
};

export default nextConfig;
