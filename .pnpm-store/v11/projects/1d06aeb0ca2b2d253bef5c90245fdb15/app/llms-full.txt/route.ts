import { frequentlyAskedQuestions, siteConfig } from "../lib/site";

export function GET() {
  const facts = frequentlyAskedQuestions
    .map(({ question, answer }) => `### ${question}\n\n${answer}`)
    .join("\n\n");

  const body = `# ${siteConfig.name}: complete product facts

Canonical URL: ${siteConfig.url}/
Official name: ${siteConfig.name}
Common search spellings: ${siteConfig.alternateNames.join(", ")}
Last reviewed: ${siteConfig.contentLastModified}

## Product summary

${siteConfig.name} is a browser-based emoji face-matching game. Players recreate an emoji expression on camera, and in-browser face-landmark analysis estimates how closely the expression matches. Players can enter a live random-player duel or use Solo Emoji Scan without a partner. The game requires JavaScript, a working webcam, camera permission, and a modern browser. No native app download is required.

## Gameplay modes

### Live Face Duel

Two randomly matched players receive the same emoji prompt. Each player recreates the expression on camera, and the closer expression score wins the round.

### Solo Emoji Scan

One player practices emoji expressions and receives an instant score without waiting for another player.

## Frequently asked questions

${facts}

## Authoritative pages

- Homepage: ${siteConfig.url}/
- How it works: ${siteConfig.url}/how-it-works
- About: ${siteConfig.url}/about
- FAQ: ${siteConfig.url}/faq
- Privacy: ${siteConfig.url}/privacy
- Terms: ${siteConfig.url}/terms
- Contact: ${siteConfig.url}/contact
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
