# Emoggle SEO + AI Search Visibility Package

Prepared for the live Next.js application on 18 July 2026.

## Executive recommendation

Emoggle should own a narrow, distinctive category first: **emoji face-matching game**. It can then expand into broader discovery topics such as webcam games, face-expression games, random video-chat games, and two-player browser games.

The repository is already on Next.js 16 with the App Router, not React + Vite as assumed in the original brief. That removes the need for a framework migration: important copy, metadata, structured data, robots rules, and sitemaps can all be server-rendered or pre-rendered with native Next.js features.

No SEO or “GEO” technique guarantees rankings or AI citations. Google explicitly says there are no extra technical requirements or special schema for its AI features beyond ordinary indexability, helpful content, and matching visible/structured information. Treat AI visibility as an extension of strong technical SEO, clear product facts, third-party corroboration, and genuinely useful content.

## Prioritized action checklist

### Quick wins: ship now

| Priority | Action | Status | Expected impact |
|---|---|---|---|
| P0 | Use a descriptive homepage title and meta description | Implemented | Clearer relevance and better search-result click-through potential |
| P0 | Add one canonical URL per indexable page | Implemented | Consolidates duplicate URL signals |
| P0 | Add crawlable homepage copy explaining the game, multiplayer, solo mode, and steps | Implemented | Gives search engines and answer engines factual text to understand |
| P0 | Add `WebApplication` + `VideoGame` JSON-LD that matches visible copy | Implemented | Stronger machine-readable entity description |
| P0 | Add visible FAQs and matching `FAQPage` JSON-LD | Implemented | Easier fact extraction; do not expect Google FAQ rich results |
| P0 | Replace manually dated `robots.txt` and `sitemap.xml` with Next.js metadata routes | Implemented | Prevents stale discovery files |
| P0 | Explicitly allow search crawlers from OpenAI, Perplexity, and Anthropic | Implemented | Avoids accidental exclusion from AI-search retrieval |
| P0 | Add Open Graph/Twitter metadata and a 1200×630 generated sharing image | Implemented | Better social previews and more shareable launch posts |
| P1 | Publish `/about`, `/how-it-works`, and `/faq` as crawlable pages | Implemented | Creates citation-friendly product facts and internal-link targets |
| P1 | Publish `/llms.txt` as a concise supplementary product map | Implemented | Low-cost experimental aid; not a ranking signal or access-control file |
| P1 | Verify the final production domain in Google Search Console and Bing Webmaster Tools | Manual | Enables indexing diagnostics and query data |
| P1 | Submit the sitemap in both webmaster tools | Manual | Faster, more reliable URL discovery |
| P1 | Set `NEXT_PUBLIC_SITE_URL` to the final custom domain before launch | Manual | Keeps canonicals, schema, sitemap, and robots on one domain |

### Next 30 days

| Priority | Action | Expected impact |
|---|---|---|
| P1 | Launch on Product Hunt and AlternativeTo with consistent wording and screenshots | Third-party entity corroboration, referral traffic, and backlinks |
| P1 | Publish a factual “How Emoggle works” launch article with original screenshots or a short demo | Creates a link-worthy explanation page |
| P1 | Submit only to relevant browser-game and indie-game directories | Focused discovery without low-quality link spam |
| P1 | Add privacy/safety details for random webcam matching, reporting, moderation, and age eligibility | Trust and recommendation readiness |
| P1 | Measure LCP, INP, and CLS on real mobile devices; defer MediaPipe assets until play is requested where possible | Better user experience and Core Web Vitals |
| P2 | Create stable URLs for `/play/solo` and `/play/multiplayer` if each can load directly | Lets each mode target distinct action intent |
| P2 | Add a small press kit with logo, 1200×630 image, screenshots, short description, and founder contact | Makes accurate coverage and backlinks easier |

### Months 2–3

| Priority | Action | Expected impact |
|---|---|---|
| P1 | Publish two useful posts per month from the calendar below | Builds topical breadth and long-tail entry points |
| P1 | Earn 5–10 relevant editorial links rather than bulk directory links | Authority, discovery, and stronger citation probability |
| P2 | Add IndexNow for new or updated content | Faster Bing/Copilot freshness; not an indexing guarantee |
| P2 | Test query clusters in Search Console and rewrite titles/intros using actual impressions | Replaces assumptions with first-party query data |
| P2 | Add creator demonstrations on YouTube/TikTok with a crawlable transcript page | Branded demand, demos, and additional discovery surfaces |

## 1. Keyword and topic research

This is a qualitative opportunity map, not fabricated search-volume data. Validate demand with Google Search Console, Bing Webmaster Tools, Google Trends, and Keyword Planner after pages are live.

| Cluster | Primary keyword | Secondary keywords | Long-tail targets | Dominant intent | Priority |
|---|---|---|---|---|---|
| Emoji games | emoji face game | emoji expression game; emoji mimic game; emoji challenge online | free emoji face-matching game in browser; game where you copy emoji faces | Action/transactional; informational | Highest |
| Face-expression games | face expression game | facial expression game; emotion recognition game; face reaction game | online facial expression matching game; webcam game that scores your expression | Action/transactional | Highest |
| Webcam games with strangers | webcam game with strangers | camera games with strangers; live camera game online | fun webcam games to play with strangers online; browser webcam game with random people | Action/transactional; discovery | High |
| Random video-chat games | random video chat game | video chat games online; Omegle-style games | random video chat with games; safer alternative to random chat with a game | Comparison/discovery; action | High but competitive |
| Face-mimic challenges | face mimic challenge | mimic face game; copy the face challenge; expression challenge | online face mimic challenge with scoring; celebrity face mimic game online | Action; social/trend discovery | High |
| Games for two people | online party games for two people | browser games for two; video-call games for two | quick online game for two people with webcam; no-download two-player camera game | Informational/comparison; action | Medium-high |
| Solo practice | solo face expression game | emoji expression practice; face score game | practice matching emoji expressions online; solo webcam expression challenge | Action/transactional | Medium |
| Brand | Emoggle | Emoggle game; Emoggle webcam game | what is Emoggle; is Emoggle free; how does Emoggle work | Navigational; informational | Defend immediately |

### Recommended page-to-query map

| Page | Primary target | Supporting targets |
|---|---|---|
| `/` | emoji face-matching game | face expression game; webcam game; browser emoji game |
| `/how-it-works` | how an emoji face game works | facial-expression scoring; webcam expression detection |
| `/about` | what is Emoggle | Emoggle game; browser face-matching game |
| `/faq` | is Emoggle free | webcam requirement; solo mode; face data; multiplayer rules |
| Future `/play/solo` | solo emoji face game | emoji expression practice; instant face score |
| Future `/play/multiplayer` | webcam game with strangers | live face duel; random video-chat game |
| Future blog hub | webcam and party game ideas | two-player games; face challenges; browser games |

### Question-style queries to target

1. What is a fun webcam game to play with strangers online?
2. Is there a game where you copy an emoji with your face?
3. What are some free browser games that use a webcam?
4. Can two people play a face-expression game online?
5. What are fun no-download games for a video call?
6. Is there an online face-mimic challenge with scoring?
7. How does emoji facial-expression matching work?
8. Can I practice matching emoji expressions by myself?
9. What is a quick online party game for two people?
10. What are game-based alternatives to random video chat?

## 2. On-page SEO

### Homepage title and description

Title tag — 40 characters:

```text
Emoggle: Emoji Face-Matching Webcam Game
```

Meta description — 140 characters:

```text
Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed.
```

### Recommended homepage heading structure

```text
H1: Emoggle — The Emoji Face-Matching Game
  H2: A Face-Expression Game Built Around One Shared Emoji
    H3: Live Emoji Face Duel
    H3: Solo Emoji Scan
  H2: How Emoggle Works
    H3: Allow Camera Access
    H3: Copy the Emoji
    H3: Get Your Score
  H2: Frequently Asked Questions
```

Use one descriptive H1. Do not make every card an H2; preserve a logical hierarchy.
Do not add a `meta keywords` tag; Google does not use it.

### URL structure

```text
/                         Homepage and game entry
/play/solo                Future directly loadable solo mode
/play/multiplayer         Future directly loadable live mode
/how-it-works             Product mechanics and scoring explanation
/about                    Neutral product fact sheet
/faq                      Visible, extractable Q&A
/blog                     Future content hub
/blog/[descriptive-slug]  Individual evergreen articles
```

Do not create thin route aliases only for keywords. `/play/solo` and `/play/multiplayer` should exist only when they can load their modes directly and offer distinct, useful copy.

### Image alt-text patterns

Describe the visible state and purpose, not a list of keywords.

```text
Emoggle live face duel showing two players matching a surprised emoji
Solo Emoji Scan scoring a smiling facial expression in the browser
Emoggle mode menu with Live Face Duel and Solo Emoji Scan options
Expression score result after a player matches a winking emoji
```

For decorative glows, shapes, and repeated UI backgrounds, use an empty alt attribute:

```html
<img src="/decorative-glow.webp" alt="" />
```

For a demo GIF, provide nearby text or a transcript explaining the interaction. Animated media alone is not a substitute for crawlable copy.

## 3. Technical SEO

### Essential checklist

| Item | Recommendation | Expected impact |
|---|---|---|
| HTTPS | Serve every public URL over HTTPS and redirect HTTP once | Security, webcam permissions, and canonical consistency |
| Indexability | Return `200` for real pages, `404` for missing pages, and avoid accidental `noindex` | Basic eligibility |
| Robots | Allow indexable pages and relevant search crawlers; do not use robots rules as privacy controls | Crawl access |
| Sitemap | List only canonical, indexable URLs with honest `lastModified` values | Discovery and freshness |
| Canonicals | Add one self-referencing canonical per page | Duplicate consolidation |
| Server-rendered text | Keep the product explanation, headings, links, and FAQs in initial HTML | Easier crawling across search and AI bots |
| Internal links | Use real `<a href>` links between home, about, how-it-works, FAQ, policies, and posts | Discovery and topical relationships |
| Metadata | Use unique titles/descriptions for every useful indexable page | Relevance and click-through potential |
| Structured data | Keep JSON-LD factual and identical to visible claims | Entity understanding |
| Mobile | Support 375px upward, 44px targets, readable 16px body copy, and no horizontal overflow | Mobile usability |
| Core Web Vitals | Target LCP ≤2.5s, INP <200ms, CLS <0.1 at the 75th percentile | Page experience |
| Media performance | Lazy-load below-fold media; reserve dimensions; use WebP/AVIF where appropriate | Faster loading and less layout shift |
| Heavy ML assets | Load MediaPipe/WASM when the player enters a camera mode if product behavior permits | Reduces homepage cost |
| Validation | Use URL Inspection, Bing Site Scan, Schema Validator, and Lighthouse | Catches regressions |
| Monitoring | Track impressions, indexed pages, crawl errors, branded searches, and conversions to “start game” | Measures outcomes |

### JavaScript-heavy application guidance

The app already uses Next.js App Router. Keep explanatory pages and metadata as Server Components, and isolate camera/game state in Client Components. This is better than converting the site back to a client-only Vite shell.

Google can render JavaScript, but server rendering or pre-rendering remains useful for speed and for crawlers that execute little or no JavaScript. Important headings, descriptions, FAQs, links, and policy facts should be present in the initial HTML. The actual camera game can remain interactive client code.

## 4. Structured data and schema

### Recommended types

- Use `WebApplication` because Emoggle is software used through a web browser.
- Add `VideoGame` as a second type because it is specifically a game.
- `SoftwareApplication` is a parent of `WebApplication`; listing both is unnecessary.
- Use `FAQPage` only when every marked-up question and answer is visible on that page.
- Do not invent ratings, review counts, awards, active-user counts, or an organization address.
- Validate general semantics with Schema.org Validator. Google’s rich-result support covers only a subset of Schema.org.

### Homepage JSON-LD

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["WebApplication", "VideoGame"],
  "name": "Emoggle",
  "url": "https://emoggle.vercel.app/",
  "description": "Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed.",
  "applicationCategory": "GameApplication",
  "operatingSystem": "Any operating system with a modern web browser",
  "browserRequirements": "Requires JavaScript and webcam access",
  "gamePlatform": "Web browser",
  "playMode": [
    "https://schema.org/SinglePlayer",
    "https://schema.org/MultiPlayer"
  ],
  "isAccessibleForFree": true,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "Live emoji expression duels with a random player",
    "Solo emoji expression practice",
    "In-browser facial-expression scoring",
    "No app download required"
  ]
}
</script>
```

### FAQ JSON-LD

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Emoggle free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Emoggle's core solo and random-match gameplay is free to use. Optional premium features may be offered separately."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need a webcam?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Live duels and solo expression scoring need access to a working webcam so Emoggle can detect and compare facial expressions."
      }
    },
    {
      "@type": "Question",
      "name": "Can I play Emoggle solo?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Solo Emoji Scan lets one player practice emoji expressions and receive an instant score without waiting for another person."
      }
    }
  ]
}
</script>
```

Important limitation: Google restricted FAQ rich results to authoritative government and health sites and has since been retiring FAQ search-appearance support. Keep a visible FAQ because it helps users and provides concise product facts, not because an expandable Google result is expected.

## 5. AI search / GEO / AEO

### Citation-friendly About Emoggle paragraph

Emoggle is a browser-based social game in which players recreate facial expressions shown as emoji prompts. In live multiplayer mode, two randomly matched players see the same emoji, make the expression on camera, and compare scores to determine the closer match. Solo Emoji Scan offers the same expression challenge for one player without requiring a partner. Emoggle uses face-landmark analysis in the browser to estimate expression similarity and provide an instant score. Live video is shared between matched players through a peer-to-peer connection. The game is designed for short, casual sessions and runs in a modern web browser without an app download. A working webcam and camera permission are required for expression scoring.

### `llms.txt` recommendation

Publish it because it is cheap to maintain and creates a concise product map, but describe it accurately: `llms.txt` is a community proposal, not a ratified crawler standard, access-control mechanism, or known ranking factor. Google specifically says no AI text file is required for AI Overviews or AI Mode.

```text
# Emoggle

> Emoggle is a free browser-based emoji face-matching game with live webcam duels and a solo practice mode.

Emoggle shows players an emoji and uses in-browser face-landmark analysis to score how closely their facial expression matches it. In multiplayer mode, two randomly matched players receive the same prompt and compare scores. In Solo Emoji Scan, one player can practice without waiting for a partner. A webcam, JavaScript, and a modern browser are required. No app download is needed.

Canonical site: https://emoggle.vercel.app/

## Product information

- [Homepage](https://emoggle.vercel.app/): Play Emoggle and compare solo and multiplayer modes.
- [How Emoggle works](https://emoggle.vercel.app/how-it-works): Steps, expression scoring, browser requirements, and privacy details.
- [About Emoggle](https://emoggle.vercel.app/about): Neutral product overview and key facts.
- [Frequently asked questions](https://emoggle.vercel.app/faq): Factual answers about cost, webcam access, solo mode, multiplayer, and face data.

## Policies

- [Privacy policy](https://emoggle.vercel.app/privacy): Data-handling information.
- [Terms and conditions](https://emoggle.vercel.app/terms): Rules for using Emoggle.
- [Contact](https://emoggle.vercel.app/contact): Support and business inquiries.
```

Replace the Vercel hostname everywhere after a custom production domain is selected.

### AI-crawler policy

Keep search/retrieval bots allowed:

```text
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /
```

Search access and model-training access are separate choices. For example, OpenAI documents `OAI-SearchBot` for search visibility and `GPTBot` for potential training. Choose a training policy deliberately rather than treating all AI bots as one category.

### FAQ page structure for answer engines

Each answer should:

1. Use the exact user question as the heading.
2. Answer directly in the first sentence.
3. Add one or two factual supporting sentences.
4. Avoid marketing superlatives and unverifiable claims.
5. State dates or version context for facts that may change.
6. Link to the relevant policy or how-it-works section.
7. Keep matching JSON-LD synchronized with the visible answer.

Useful future questions include age requirements, browser support, microphone use, what happens to scores, how reports work, and whether players can invite a friend. Publish answers only after the product behavior is settled.

### Third-party distribution and corroboration

| Platform | Recommendation | Why it helps |
|---|---|---|
| Product Hunt | High priority at launch | Crawlable product page, launch traffic, comments, backlinks, and an external product description |
| AlternativeTo | High priority | Category/comparison discovery and user-generated alternatives context |
| itch.io | High priority if web games are accepted for the launch | Relevant game audience and an external playable/listing page |
| Indie Hackers | Medium-high | Build story, founder context, feedback, and a legitimate contextual link |
| Reddit | High potential, community-sensitive | Real discussions may surface in search/AI answers; disclose that you built it and follow each subreddit’s rules |
| YouTube | High priority | Searchable demonstrations; add accurate titles, descriptions, chapters, and captions |
| Discord communities | Community/retention, not primarily SEO | User feedback, events, and word of mouth |
| G2 | Low priority | Primarily B2B software intent; use only if Emoggle develops a team-icebreaker or workplace product |
| Generic “AI SEO directories” | Skip unless they send real users | Often low quality, duplicated, and unlikely to build durable authority |

Keep the same category sentence, URL, logo, screenshots, feature names, and privacy facts across listings. Consistency helps systems reconcile that these sources describe the same product.

## 6. Content strategy

### Content ideas

| Working title | Primary target | What makes it reference-worthy |
|---|---|---|
| 12 Fun Webcam Games to Play With Strangers Online | webcam games with strangers | Original comparison table: camera required, player count, download, safety controls |
| 15 No-Download Games for Two People on a Video Call | online games for two people | Practical filters and direct play links |
| How Emoggle Works: Scoring an Emoji Facial Expression | how Emoggle works | Product diagrams, scoring explanation, limitations, and privacy facts |
| Face Mimic Challenges: 25 Prompts for Friends | face mimic challenge | Original prompt list that works on camera |
| Solo Emoji Challenge: Can You Match These 20 Faces? | solo emoji game | Playable challenge linked to Solo Emoji Scan |
| Webcam Game Safety: A Practical Checklist Before Matching With Strangers | webcam game safety | Clear safety advice, reporting guidance, and age context |
| The Browser Tech Behind a Real-Time Face-Expression Game | browser face detection game | First-party engineering details: MediaPipe, WebRTC, Socket.IO |
| Emoji Expressions Explained: What Makes a Smile, Wink, or Surprise Detectable? | emoji expression matching | Visual examples and limitations without medical claims |

Avoid writing a generic “best games” article that simply paraphrases competitors. Include original screenshots, explicit selection criteria, honest comparisons, and a short methodology.

### First three months

Cadence: two substantial posts per month, plus one small product update or changelog entry when behavior actually changes.

| Month | Post 1 | Post 2 | Distribution |
|---|---|---|---|
| Month 1 | How Emoggle Works | 12 Fun Webcam Games to Play With Strangers | Product Hunt, Indie Hackers, relevant communities |
| Month 2 | 15 No-Download Games for Two People | Face Mimic Challenges: 25 Prompts | Short demo clips, Reddit where permitted, outreach to game curators |
| Month 3 | Webcam Game Safety Checklist | The Browser Tech Behind Emoggle | Developer communities, WebRTC/MediaPipe audiences, newsletter outreach |

Update the year in a title only when the underlying recommendations are genuinely reviewed. Do not mass-create near-duplicate location or year pages.

## 7. Off-page and social signals

### Backlink opportunities

1. Browser-game curators and indie-game newsletters: offer a concise press kit and a playable link.
2. WebRTC, MediaPipe, and Next.js engineering communities: publish the technical build article with reusable lessons.
3. Party-game and remote-event bloggers: pitch Emoggle as a tested entry with a clear player-count/camera/no-download fact sheet.
4. Product Hunt, AlternativeTo, itch.io, and Indie Hackers: complete profiles with consistent facts.
5. Relevant Reddit communities such as r/WebGames, r/InternetIsBeautiful, r/SideProject, and developer communities: post only where self-promotion rules allow, disclose affiliation, and ask for specific feedback.
6. Small creators who cover browser games, party games, or reaction challenges: provide a direct demo link and permission to use press-kit images.
7. University game-development clubs, hackathon showcases, and indie Discord servers: seek playtests and editorial mentions, not paid link exchanges.

Avoid bulk directory submissions, private blog networks, paid dofollow links, and reciprocal-link pages.

### Copy-ready Open Graph and X/Twitter tags

Next.js metadata renders these tags automatically; this is the equivalent HTML:

```html
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Emoggle" />
<meta property="og:url" content="https://emoggle.vercel.app/" />
<meta property="og:title" content="Emoggle: Emoji Face-Matching Webcam Game" />
<meta property="og:description" content="Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed." />
<meta property="og:image" content="https://emoggle.vercel.app/opengraph-image" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Emoggle emoji face-matching webcam game" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Emoggle: Emoji Face-Matching Webcam Game" />
<meta name="twitter:description" content="Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed." />
<meta name="twitter:image" content="https://emoggle.vercel.app/opengraph-image" />
```

## 8. Measurement plan

### Baseline before launch

- Record indexed URL counts in Google and Bing.
- Run mobile Lighthouse on `/`, `/about`, `/how-it-works`, and `/faq`.
- Save screenshots of rendered HTML from URL Inspection.
- Validate JSON-LD with Schema.org Validator.
- Record current branded and non-branded impressions.

### Weekly for the first month

- Search Console: pages indexed, impressions, queries, CTR, Core Web Vitals.
- Bing Webmaster Tools: indexed pages, crawl errors, Site Scan, search keywords.
- Analytics: organic landing pages, game starts, solo starts, matchmaking starts.
- Referrals: Product Hunt, AlternativeTo, Reddit, YouTube, ChatGPT (`utm_source=chatgpt.com` where present).

### 30/60/90-day decisions

- At 30 days, rewrite weak titles only where impressions exist but CTR is poor.
- At 60 days, expand pages that rank on page 2 or receive meaningful long-tail impressions.
- At 90 days, prune or merge content that has no impressions, no links, and no product value.
- Track AI citations manually with a stable set of prompts, but treat results as directional because answers vary by system, location, and time.

## Source-backed implementation notes

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — no special AI file or schema is required; ordinary SEO and visible text remain central.
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — server/pre-rendering remains helpful for users and crawlers.
- [Google: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — LCP, INP, and CLS thresholds.
- [Google: FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes) — consumer sites should not expect FAQ rich results.
- [Google: Software application structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app) — web application support.
- [Schema.org: VideoGame](https://schema.org/VideoGame) — game properties such as platform and play mode.
- [OpenAI: Publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) — allow `OAI-SearchBot` for ChatGPT search visibility.
- [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) — allow `PerplexityBot` for search visibility.
- [Anthropic crawler documentation](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) — crawler names and robots behavior.
- [Bing: IndexNow](https://www.bing.com/indexnow/getstarted) — faster change notification without an indexing guarantee.
- [`llms.txt` proposal](https://llmstxt.org/) — proposed Markdown format and intended role.
