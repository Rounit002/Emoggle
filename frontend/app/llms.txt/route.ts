import { siteConfig } from "../lib/site";

export function GET() {
  const aliases = siteConfig.alternateNames.join(", ");
  const body = `# ${siteConfig.name}

> ${siteConfig.name} is a free browser-based emoji face-matching game with live webcam duels and a solo practice mode.

${siteConfig.name} shows players an emoji and uses in-browser face-landmark analysis to score how closely their facial expression matches it. In multiplayer mode, two randomly matched players receive the same prompt and compare scores. In Solo Emoji Scan, one player can practice without waiting for a partner. A webcam, JavaScript, and a modern browser are required. No app download is needed.

Official name: ${siteConfig.name}
Common search spellings: ${aliases}
Canonical site: ${siteConfig.url}/

## Product information

- [Homepage](${siteConfig.url}/): Play ${siteConfig.name} and compare solo and multiplayer modes.
- [How ${siteConfig.name} works](${siteConfig.url}/how-it-works): Steps, expression scoring, browser requirements, and privacy details.
- [About ${siteConfig.name}](${siteConfig.url}/about): Neutral product overview, official spelling, and key facts.
- [Frequently asked questions](${siteConfig.url}/faq): Factual answers about cost, webcam access, solo mode, multiplayer, and face data.

## Policies

- [Privacy policy](${siteConfig.url}/privacy): Data-handling information.
- [Terms and conditions](${siteConfig.url}/terms): Rules for using ${siteConfig.name}.
- [Contact](${siteConfig.url}/contact): Support and business inquiries.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
