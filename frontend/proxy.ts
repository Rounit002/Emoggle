import { NextRequest, NextResponse } from "next/server";

function originFor(value: string | undefined, fallback: string): string {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return fallback;
  }
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const signalingOrigin = originFor(
    process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL,
    "http://localhost:3001",
  );
  const signalingWsOrigin = signalingOrigin.replace(/^http/, "ws");
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    font-src 'self' data:;
    connect-src 'self' ${signalingOrigin} ${signalingWsOrigin} https://api.revenuecat.com https://*.revenuecat.com https://*.paddle.com https://storage.googleapis.com https://0.peerjs.com wss://0.peerjs.com;
    media-src 'self' blob:;
    worker-src 'self' blob:;
    frame-src https://js.stripe.com https://cdn.paddle.com https://*.revenuecat.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
