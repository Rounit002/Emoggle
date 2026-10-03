# Emoggle codebase guide

Reviewed on **2026-10-03**, including the existing local edits and the untracked `marketing-video/` project. This is a developer reading guide and repository-wide structural review. [ARCHITECTURE.md](ARCHITECTURE.md) explains service boundaries, data ownership, protocols, and runtime flows.

Application source, configuration, database definitions, test entry points, and supporting scripts were inspected. Dependencies, generated Next.js output, graph caches, binary WASM, and image/audio assets were treated as dependencies or assets rather than application source. The checks below do not claim live database, payment, model-provider, or real-camera validation.

## Start here

Read these files in this order to understand a normal multiplayer round:

1. `frontend/app/page.tsx`: the server-rendered homepage and its client entry point.
2. `frontend/app/components/HomeExperience.tsx`: provider composition and mode-to-arena switching.
3. `frontend/app/components/ModeSelect.tsx`: name gate, mode selection, manual support entry, 1v1 entry, and online count.
4. `frontend/app/components/DuelArena.tsx`: camera, scoring, round phases, result, local history.
5. `frontend/app/hooks/useMatchmaking.ts`: Socket.IO protocol and PeerJS camera connection.
6. `signaling-server/index.js`: authenticated queue, server schedule, score acceptance, cleanup.
7. `frontend/app/lib/serverClock.ts` and `frontend/app/hooks/useRoundClock.ts`: clock conversion and scan deadline.
8. `frontend/app/hooks/useExpressionScorer.ts`, `frontend/app/hooks/useStableScoreSampler.ts`, and `signaling-server/matchScore.js`: browser score versus server final result.
9. `frontend/app/components/result/ResultScreen.tsx` and `frontend/app/components/result/useShareScorecard.ts`: final display and PNG sharing.

The central distinction is that **the browser measures expressions; the server coordinates rounds and normalizes reported scores**. Media streams use WebRTC. Supabase name persistence is separate from signaling authentication.

## Source map

Paths in the following tables are relative to the repository root, or to the directory named by a subsection. Grouped filenames have the same architectural role.

### Root and service startup

| File/directory | Responsibility |
| --- | --- |
| `index.js` | Loads the signaling-server entry point. There is no root package manifest or root frontend build script. |
| `start-backend.ps1`, `start-frontend.ps1` | Resolve their own directory and start each package. Frontend startup writes a log. |
| `schema.sql` | Historical SQL baseline; current backend schema additions live in `db.js`. |
| `supabase/migrations/20260920120000_create_profiles.sql` | Name table, Auth foreign key, own-row RLS, validation checks, updated_at trigger. Applied separately. |
| `.github/workflows/security.yml`, `.github/dependabot.yml` | Security checks and dependency update configuration for three application packages. |
| `graphify-out/` | Previously generated graphs and search/cache artifacts; not imported at runtime. |
| Existing celebrity/implementation/security/SEO Markdown files | Historical feature/setup notes. Resolve disagreements using source and the refreshed architecture document. |

### Frontend routes and configuration

Within `frontend/`:

| File/group | Responsibility |
| --- | --- |
| `app/layout.tsx`, `app/template.tsx` | Server route shell, fonts, metadata, nonce/theme boot, shared theme wrapper. |
| `app/page.tsx` | Homepage, JSON-LD, lower informational sections, footer navigation. |
| `app/about/page.tsx`, `app/how-it-works/page.tsx`, `app/faq/page.tsx` | Product information and browser/game explanation. |
| `app/contact/page.tsx` | Contact information and email links; no contact-submission backend. |
| `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/refund/page.tsx` | Informational policy pages. |
| `app/history/page.tsx`, `app/history/layout.tsx` | Local solo/duel history, statistics, clearing controls, route metadata. |
| `app/verify-scorecard/page.tsx` | Fixed fixture page for scorecard verification, not server-side result authentication. |
| `app/sitemap/page.tsx`, `app/sitemap.ts`, `app/robots.ts` | Human sitemap, XML metadata sitemap, crawler policy. |
| `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts` | Plain-text product information with cache headers. |
| `app/opengraph-image.tsx`, icons under `app/` | Social preview and app/brand icons. |
| `proxy.ts` | Request CSP nonce and allowed connection origins. Uses this Next.js version's proxy convention. |
| `next.config.ts` | `.next-build`, image sizes, inline CSS experiment, headers, host/spelling redirects. |
| `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs` | Strict TypeScript, current Next/React lint rules, Tailwind PostCSS. |
| `package.json`, `env.example`, `.env.example` | Package commands and two complementary environment templates. |
| `AGENTS.md` | Next.js-specific contributor instructions: consult bundled framework guides before changing code. |

### Frontend contexts

Within `frontend/app/context/`:

| Module | Ownership and important behavior |
| --- | --- |
| `UserProfileContext.tsx` | Device ID and anonymous signaling session, tab token coordination, server-derived ELO/VIP, logout. Does not trust persisted browser ELO/VIP. |
| `PlayerNameContext.tsx` | Local name hydration, immediate name updates, lazy Supabase writes, pending marker and retry API. Current startup does not load the remote name. |
| `CountryContext.tsx` | Cached country and explicit refresh API. Current first mount does not launch geo detection. |
| `MediaPipeFaceContext.tsx` | Lazy shared FaceLandmarker instance, GPU/video options, local WASM path, remote model URL, readiness/error state. |
| `ThemeContext.tsx` | Light/dark DOM attribute, saved manual preference, optional system-following API. `public/theme-boot.js` applies the initial preference before hydration. |

### Frontend orchestration and presentation

Within `frontend/app/components/`:

| Module/group | Role |
| --- | --- |
| `HomeExperience.tsx` | Client view state; providers; dynamic arenas; automatic cross-mode ticket transfer; scroll restoration. |
| `ModeSelect.tsx` | Landing hero/cards, delayed online polling, mode-picker/support entry. Name entry follows a game choice; cancellation abandons that choice, and successful validation starts it. `HERO_CHIP_ANIMATION` selects the hero text style. |
| `ChooseGameMode.tsx` | Fullscreen four-mode picker; focus/keyboard and scroll behavior; its own backdrop. |
| `NameEntryModal.tsx` | Validate a name, trap focus, first-time/edit copy, and cancellation back to browsing; delegates persistence to its caller. |
| `DuelArena.tsx` | Emoji multiplayer coordinator: local camera/mic, shared hook, FaceSync lead-in, clock phases, mean sampler, server result, local duel history. |
| `SoloFaceJudge.tsx` | Local ten-second mean-scored rounds, camera retry, prompt changes, personal best and local history. |
| `CelebrityDuelArena.tsx` | Celebrity multiplayer using the shared matchmaking hook, reference profile, best-frame accumulation, specialized results. |
| `FaceSyncArena.tsx` | Resemblance-only multiplayer, camera/mic, result/missed view, chat/report/next-stranger controls. |
| `FaceSync.tsx` | Presentational scanning/count-up/result treatment; does not calculate the similarity. |
| `VideoPanel.tsx` | Local/remote video rendering, stream attachment, camera error UI, local mesh overlay, score/name/country display, optional legacy frozen frame. Arenas own stream acquisition. |
| `ChatBox.tsx` | Responsive desktop chat/mobile drawer, bounded messages, typing debounce, censoring, skip/report actions. Transport is supplied through callbacks. |
| `CelebrityResultScreen.tsx` | Celebrity outcome, target image, reaction, scores, actions, specialized share card. |
| `SupportModal.tsx` | USD amount input, authenticated checkout request, navigation to Dodo checkout. |
| `UploadJudge.tsx` | Dormant upload UI: read an image, validate size, call authenticated judge proxy, show result/error. |
| `AnalyzingOverlay.tsx`, `ScoreCard.tsx` | Photo-judge/older result presentation. Their presence does not make upload a selectable game. |
| `Countdown.tsx` | Reusable countdown presentation; the authoritative gameplay clock is elsewhere. |
| `SmoothScroll.tsx` | Native scroll wrapper retaining a no-op controller API; current code does not initialize Lenis. |
| `InfoPageShell.tsx`, `Footer.tsx` | Shared informational-page shell/navigation. |

Within `frontend/app/components/home/`:

| Module | Role |
| --- | --- |
| `DoodleBackdrop.tsx`, `DoodleBackdrop.module.css` | Deterministically positioned artwork on CSS-driven diagonal tracks, theme and covered-view rules. |
| `EmojiMotion.tsx` | Emoji animation and scroll-reveal primitives. |
| `HeadlineMotion.tsx` | Headline, pop, typewriter, pulse, gooey, and rotating-text wrappers. The selected hero variant is controlled by ModeSelect. |
| `useCoveredView.ts` | Ref-count document coverage so overlapping picker/arena transitions do not restore hidden wallpaper early. |
| `../HeroPreview.module.css` | Preview-card layout and animation styles for the landing hero. |

### Hooks and algorithms

Within `frontend/app/`:

| Module | Responsibility |
| --- | --- |
| `hooks/useLocalCamera.ts` | Acquire camera, optionally microphone; retry video-only if audio fails; stop acquired tracks on cleanup/retry. |
| `hooks/useMatchmaking.ts` | Shared Socket.IO/PeerJS lifecycle; queue after socket and peer are ready; role-based call/answer; delayed-stream handling; events, chat, reporting, mode transfer, teardown. |
| `hooks/useCelebrityMatchmaking.ts` | Unused alternate celebrity hook. Active CelebrityDuelArena imports useMatchmaking. |
| `hooks/useExpressionScorer.ts` | Detect frames only when active and video time changes; geometry/blendshape scoring; face box/landmarks/status; live callbacks about every 180 ms. |
| `hooks/useCelebrityExpressionScorer.ts` | Detect valid celebrity-expression frames and expose score/metrics/mesh; live callbacks about every 150 ms. |
| `hooks/useStableScoreSampler.ts` | Fixed-interval valid samples, running mean/peak/count, synchronous current snapshot for finalization. |
| `hooks/useRoundClock.ts` | Deadline-based FaceSync/countdown/scan/end phases; visibility catch-up; once-only scan-end callback. |
| `hooks/useFaceSync.ts` | Geometry collection, inference duty throttling, median stability, once-only submit, timeout, result hold, cleanup. |
| `lib/serverClock.ts` | Low-RTT clock offset, initial/resync handshakes, local schedule prediction and go anchoring. |
| `lib/celebrityScoring.ts` | Profile types/defaults, metric extraction, target resolution, weighted symmetric scoring, valid-frame filter, peak accumulator. |
| `lib/celebrityScoring.test.ts` | Synthetic geometry/profile and peak-scoring checks. |
| `lib/faceSync/types.ts` | Vector/wire/result/state types and shared client limits. |
| `lib/faceSync/geometry.ts` | Aspect-corrected head-coordinate geometry, pose/frame gates, 20 features, median and dispersion. |
| `lib/faceSync/machine.ts` | Pure reducer: idle -> waiting -> scanning -> calculating -> result -> complete, with failure/reset paths. |
| `lib/faceSync/messages.ts` | Category/variant-to-copy mapping and waiting/result messages. |
| `lib/storage.ts` | Safe browser storage, validation, pending names, migration, capped histories, aggregate stats, country cache. |
| `lib/nameModeration.js`, `nameModeration.d.ts` | Name moderation policy and TypeScript declaration; mirrored on the server and checked for consistency. |
| `lib/country.ts` | ISO flag/label conversion and legacy metadata normalization with neutral fallback. |
| `lib/geo.ts` | Cached lookup, timeout-controlled ipapi.co request, then ip-api.com fallback. |
| `lib/supabase/client.ts` | Lazy optional shared browser client; published key handling and persisted Auth session. |
| `lib/supabase/profile.ts` | Retry/error classification, anonymous/Auth helpers, Google OAuth helper, name CRUD and duplicate-row handling. |
| `lib/site.ts` | Canonical domain, site metadata, FAQ copy, content modification date. |

### Result and UI modules

Within `frontend/app/components/result/`:

| Module/group | Responsibility |
| --- | --- |
| `ResultScreen.tsx` | Emoji outcome/reaction, pending-server-result state, actions and share composition. |
| `ShareScoreCard.tsx`, `CelebrityShareScoreCard.tsx` | Fixed-size presentational export cards with DOM datasets for sharing. |
| `ShareScoreCardPortal.tsx` | Move export content into a body-level off-screen portal to escape transformed/clipped parents. |
| `useShareScorecard.ts` | Font/layout readiness, PNG conversion, blank-image guard, native sharing/download, share state. |
| `ShareButton.tsx` | UI for generating/opening/shared/downloaded/error states. |
| `SarcasticMessageGenerator.ts`, `celebrityReaction.ts` | Score-to-percentage bands and randomized reaction pools, reused for display/export. |
| `analytics.ts` | Sanitized local console events; no external analytics SDK is called here. |
| `index.ts` | Barrel exports. |

Within `frontend/app/ui/`, `Button`, `IconButton`, `Pill`, `Score`, `ProgressBar`, `Logo`, `ThemeToggle`, `LobbyOverlay`, `Seam`, and `EmojiPromptMotion` provide shared UI. `Icon.tsx` defines SVG icons; `WebEmoji.tsx` renders emoji text; `player.ts` assigns stable peer seats/colors; `cn.ts` joins class names; `index.ts` exports primitives.

`frontend/lib/utils.ts` re-exports that class joiner for `@/lib/utils` consumers. It is a plain joiner, not Tailwind conflict merging. `frontend/components/ui/text-rotate.tsx` and `gooey-text-morphing.tsx` are reusable animation implementations; `components/demo/` contains their demonstration compositions.

### Signaling service

Within `signaling-server/`:

| Module | Responsibility |
| --- | --- |
| `index.js` | Load environment; build DB URL; Express/CORS/headers/rate limits; session/payment/judge/geo routes; match queue/maps; socket auth/events; schedules/results/cleanup; health/readiness; startup/shutdown and session sweep. |
| `db.js` | pg pool configuration and idempotent runtime schema additions. |
| `middleware/verifyToken.js` | Token parsing/validation/hash, database or memory lookup, HTTP/socket authentication. |
| `matchScore.js` | Clamp/sample mean, five-sample submission rule, deadline fallback, mirrored results. |
| `faceSync.js` | Validate vectors, weighted tolerance distance, score curve/categories, stable copy seed. |
| `clientIp.js` | Resolve rate-limit address through configured trusted proxy hops; normalize/reject malformed input. |
| `nameModeration.js` | Same display-name policy as frontend. |
| `supportAmount.js` | Strict decimal USD string -> integer cents with $1 minimum. |
| `routes/celebrity.js` | Protected read/pagination/landmark-retrieval APIs with validated parameters. |
| `seed-celebrities.js` | Insert sample rows/profiles. Uses actual DB writes; reading it did not execute it. |
| `prisma/schema.prisma`, `prisma/migrations/add_celebrity_faces_table.sql` | Historical schema/seed assets, not the running ORM or a complete migration history. |
| `package.json`, `.env.example` | Start/dev/test/db-init commands and configuration template. |

When tracing `index.js`, follow these functions rather than reading the file as one block:

- `POST /api/session` and authentication middleware establish trusted identity.
- `join_queue` -> `ensureUser` -> `enqueueSocket` -> `pairSockets` -> `startMatch` establish a round.
- `startMatch` owns FaceSync resolution and countdown callbacks.
- `live_score` / `submit_score` -> `finalizeMatchResult` -> `finalizeMatchScores` produce immutable results.
- `clearMatchState`, `clearModeSwitch`, stop/skip/disconnect handlers own resource cleanup.

### Judge and video projects

| Path/group | Responsibility |
| --- | --- |
| `ai-judge/main.py` | FastAPI middleware/shared-secret auth, image validation, random fallback, lazy Gemini model, concurrency/timeouts, health and judge endpoints. |
| `ai-judge/test_security.py` | Small PNG acceptance, bad base64, excessive pixel dimensions. |
| `ai-judge/requirements.txt`, `runtime.txt`, `.env.example` | Runtime/dependency/configuration files. |
| `marketing-video/src/index.ts`, `Root.tsx` | Register Remotion root and `Emoggle207AM`: 1080 x 1920, 30 fps, 960 frames/32 seconds. |
| `marketing-video/src/Video.tsx`, `timing.ts` | Compose seven scenes on a 120 BPM frame grid, plus shared cue timing. |
| `marketing-video/src/theme.ts`, `components.tsx` | Matching palette/fonts and reusable animated art, wordmark, camera-card and other composition primitives. |
| `marketing-video/src/Soundtrack.tsx` | Background audio and frame-positioned sound effects. |
| `marketing-video/src/scenes/Night.tsx`, `Match.tsx`, `Rounds.tsx`, `Laugh.tsx`, `Rematch.tsx`, `Tagline.tsx`, `EndCard.tsx` | Intro, matching, emoji barrage, comedy beat, rematch, tagline, branded end card. These are presentation sequences, not live game logic. |
| `marketing-video/scripts/make_audio.py` | NumPy synthesis of background music and one-shot WAV effects. |
| `marketing-video/package.json`, `tsconfig.json`, `README.md` | Separate install/studio/render/still/sounds commands. No runtime dependency on the game services. |

## Important contracts when changing code

| Change | Keep aligned |
| --- | --- |
| Round duration/countdown | Server constants, serverClock, useRoundClock, arenas, grace windows, timing tests. |
| Emoji score aggregation | Browser sampler and `matchScore.js`; final UI must use server result, not a preview score. |
| Celebrity metric/target | Metric names, weights/defaults, seed profiles, pilot target payload, scorer tests. |
| FaceSync features | Client extractor vector order, types/length/bounds, server feature order/tolerances, synthetic similarity tests. |
| Display-name validation | Frontend storage/moderation, server validation/moderation, profile SQL constraints. |
| Game mode | Picker type, HomeExperience mapping, shared hook type, server parser/queue/round rules, DB mode constraint. |
| Token/session behavior | Provider storage/BroadcastChannel, bootstrap, HTTP/socket middleware, memory fallback. |
| Sharing layout | Fixed card dimensions, portal, font readiness, DOM dataset fields, visible reaction string. |
| Provider hosts | Public environment values, CSP connection origins, CORS/trusted origins, optional TURN. |

Do not assume an existing comment or historical document describes the current implementation. Examples include the name migration comments, Lenis comments, former ELO/gender filtering, and celebrity catalogue rotation.

## Review findings

These findings were documented without changing application behavior.

| Finding | Evidence and impact | Suggested next change |
| --- | --- | --- |
| **Name persistence is not restored on startup.** | `PlayerNameContext.tsx` mount effect reads only `getName()` and marks configured state synced. Remote `getProfile()` and pending-name replay are absent. No UI calls `retrySync()`. Saved remote names and failed writes can remain unused after reload. | Restore profile bootstrap/pending replay with stale-write protection; distinguish local hydration from confirmed sync. |
| **Legacy anon-key configuration is inconsistent.** | `supabase/client.ts` supports either key spelling, but PlayerNameContext checks only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. An anon-key-only installation stays local-only. | Use the shared configuration decision without eagerly initializing the SDK. |
| **Country detection is not initiated.** | `CountryContext.tsx` returns from its effect when `refreshTick === 0`; no current consumer calls refresh. Players without a fresh cache normally get no browser-derived country. | Choose an explicit deferred detection trigger and invoke it when needed. |
| **Signaling URL defaults differ.** | Hooks default to localhost:3001, but UserProfileProvider skips session creation when the public variable is missing. A default local socket URL cannot work without a token. | Share a URL resolver or require/document the variable consistently. |
| **Memory-session lifecycle differs from database sessions.** | Memory tokens have no expiry; `DELETE /api/session` always runs a PostgreSQL DELETE and does not remove the memory token. Fallback logout can return 503 while a token remains valid. | Add expiry/revocation and cleanup to memory stores, and define where fallback is allowed. |
| **Database TLS verification was fixed during implementation.** | `db.js` now requires production `rejectUnauthorized: true`, accepts an optional CA, and strips URL SSL overrides. The constructor regression test passes. | Verify a real connection against the configured database provider before deployment. |
| **Historical schemas, feature copy, and implementation differ.** | Root README still lists Next.js 15; historical Prisma defaults use CUID/400 ELO; runtime uses UUID/1000. Landing copy mentions a leaderboard and a three-second solo challenge, while no leaderboard route exists and solo runs ten seconds. | Reconcile historical setup/schema/copy with implemented behavior. |
| **Celebrity catalogue expansion needs more than seed rows.** | Active selection filters to IShowSpeed Squint; other seed images are not bundled. | Supply assets and revise selection deliberately before expanding the playable catalogue. |
| **Frontend lint is currently failing.** | 29 errors and 14 warnings from existing source/scripts; categories include React purity/refs/effect state, explicit any, unescaped entities, prefer-const and ts-comment rules. | Address violations in focused changes, then add lint to CI if it should block releases. |

Expression-score trust, static public TURN credentials, process-local matchmaking, and the unpinned MediaPipe model URL are architectural constraints, detailed in [ARCHITECTURE.md](ARCHITECTURE.md). They should be considered before enabling competitive ranking or scaling the signaling service.

## Verification performed

Checks ran against the existing working tree before the documentation edits:

| Check | Result |
| --- | --- |
| Frontend TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **Passed.** |
| Frontend `npm run lint`; structured ESLint follow-up for totals | **Failed: 29 errors, 14 warnings.** These are existing code/script findings. |
| Frontend reaction, sampler, country, name-moderation, FaceSync machine, geometry, and similarity scripts | **All seven passed.** Executed through `node --import tsx`. |
| Frontend `app/lib/celebrityScoring.test.ts` | **Passed.** Executed with `node --import tsx --test`. |
| Frontend `scripts/verify-round-sync.ts` | **Passed:** 13 timing checks, including wrong device clock, throttling, go anchoring, and submission grace. |
| Backend `npm test` unit stage | **Passed: 45 tests.** The initial integration stage failed before the child server became ready. |
| Backend celebrity integration rerun on `SMOKE_PORT=3199` | **Passed:** pairing, persistent wait/restart, shared schedule, submissions, duplicate protection, cross-mode handoff. |
| Backend FaceSync integration on `FACESYNC_SMOKE_PORT=3198` | **Passed: 47 checks, 0 failures.** |
| Judge `python -m unittest -v test_security.py` | **Passed: 3 tests.** |

The initial combined backend test command exited nonzero; its unit stage and the subsequent individual integration results are reported separately. The retry did not establish a definite cause for the first startup failure.

Not run during the initial review: live Supabase/RLS writes, live billing/webhooks, Gemini calls, real-camera/TURN negotiation, browser visual verification, production deployment probes, dependency audits, frontend production build, or marketing-video render. Source inspection and synthetic tests cannot validate those external/runtime paths.

### Name-entry follow-up verification (2026-10-03)

Name entry is now represented by an explicit selected game or edit-name action. Cancelling abandons the selected game; a failed name validation cannot advance into it.

- TypeScript passed with `--noEmit --incremental false`.
- Focused ESLint passed for `ModeSelect.tsx` and `NameEntryModal.tsx`.
- Headless Chrome verified a fresh homepage without a popup, support access without name entry, the picker before name entry for all four games, empty/whitespace rejection, cancellation, direct-card gating, valid-name continuation, saved-name reuse, and editing an existing name.
- An isolated mobile browser context verified browsing, picker order, FaceSync name entry, cancellation, and starting the selected solo game after entering a valid name.

These local UI checks blocked external service requests and mocked camera acquisition. They verify the entry flow, not live Supabase writes, payments, face tracking, or multiplayer connectivity.

### Existing test and verification inventory

Within `signaling-server/test/`:

- `auth.test.js`, `clientIp.test.js`, `matchScore.test.js`, `nameModeration.test.js`, `faceSync.test.js`, `supportAmount.test.js`: pure/unit backend checks.
- `celebrity.test.js`: starts a local child server and two Socket.IO clients; default port 3099 or SMOKE_PORT.
- `faceSyncFlow.test.js`: local multiplayer resemblance/skip/disconnect/standalone-mode flow; default port 3098 or FACESYNC_SMOKE_PORT.
- `probe-live.js`: separate live service probe; excluded from this local review.

Within `frontend/scripts/`:

| Group | Files |
| --- | --- |
| Lightweight logic | `test-sarcastic.ts`, `test-sampler.ts`, `test-country.ts`, `test-name-moderation.ts`, `test-facesync-machine.ts`, `test-facesync-geometry.ts`, `test-facesync-similarity.ts`, `verify-round-sync.ts`. |
| Geometry calibration/exploration | `facesync-probe.ts`, `facesync-expression-probe.ts`, `facesync-curve-sweep.ts`. |
| Browser layout/result/game checks | `verify-layout.ts`, `verify-zindex.ts`, `verify-scorecard.ts`, `verify-solo-round.ts`, `verify-mode-picker.ts`, `verify-mode-picker-scroll.ts`, `verify-facesync-e2e.ts`, `verify-facesync-mode.ts`. |
| Profile integration | `verify-name-migration.ts` (browser), `verify-supabase.ts` (configured service/Auth/RLS checks). |

Browser scripts generally need an already-running frontend and Chrome; several hardcode the Windows Chrome executable, while others accept CHROME_PATH. VERIFY_BASE generally overrides localhost:3000. Read each script before assuming it is portable or read-only: profile verification can create remote users/rows.

### Lint distribution

| Area | Errors | Warnings |
| --- | ---: | ---: |
| AnalyzingOverlay | 1 | 0 |
| CelebrityDuelArena | 3 | 6 |
| ChatBox | 0 | 1 |
| DuelArena | 5 | 5 |
| home/EmojiMotion | 3 | 0 |
| home/HeadlineMotion | 1 | 0 |
| ScoreCard | 2 | 0 |
| UploadJudge | 0 | 1 |
| CountryContext | 1 | 0 |
| MediaPipeFaceContext | 4 | 0 |
| PlayerNameContext | 1 | 0 |
| ThemeContext | 1 | 0 |
| UserProfileContext | 1 | 0 |
| history/page | 1 | 0 |
| useCelebrityExpressionScorer | 1 | 0 |
| useExpressionScorer | 1 | 0 |
| useStableScoreSampler | 0 | 1 |
| scripts/test-facesync-geometry | 1 | 0 |
| scripts/verify-scorecard | 2 | 0 |
| **Total** | **29** | **14** |

## Where to make common changes

| Task | Starting files |
| --- | --- |
| Landing copy/hero/card design | `ModeSelect.tsx`, `page.tsx`, `home/HeadlineMotion.tsx`, `HeroPreview.module.css`, `globals.css`. |
| Pairing rules or reconnect behavior | `signaling-server/index.js`, `useMatchmaking.ts`, multiplayer integration tests. |
| Emoji accuracy or final scoring | `useExpressionScorer.ts`, `useStableScoreSampler.ts`, `matchScore.js`. |
| Add another celebrity target | `seed-celebrities.js`, server pilot/selection, `public/celebrity-faces/`, `celebrityScoring.ts`. |
| Face resemblance tuning | `faceSync/geometry.ts`, `signaling-server/faceSync.js`, geometry/similarity/flow tests. |
| Names and restoration | `PlayerNameContext.tsx`, `supabase/profile.ts`, `storage.ts`, profile migration. |
| Camera/mic or mobile chat | `useLocalCamera.ts`, `VideoPanel.tsx`, arena layouts, `ChatBox.tsx`. |
| Share card/export | Result screens, ShareScoreCard components, portal, sharing hook. |
| Support payment | `SupportModal.tsx`, billing/webhook routes, `supportAmount.js`, payment tables. |
| Outfit judging | `UploadJudge.tsx`, Express judge proxy, `ai-judge/main.py`; wire a frontend entry point if wanted. |
| SEO/domain | `site.ts`, metadata routes/layout, `next.config.ts`. |
| Marketing spot | `marketing-video/src/timing.ts`, scenes, Soundtrack, audio synthesis script. |

When source or wiring changes, update these two documents together. Keep planned features, historical helpers, and running behavior distinguishable.

## October 3 implementation map

- `frontend/app/1v1/page.tsx` and `components/PrivateDuelExperience.tsx`: private setup, fragment invitation preview, explicit name/join, share/regenerate/cancel lobby, and resumable tab series ID.
- `components/PrivateDuelExperience.module.css`: unified round slider/game cards, distinct purple slider, keyboard focus, phone/tablet/desktop layouts and reduced-motion handling. Emoji, Celebrity and Face Sync choices stay in the same setup screen.
- `components/FaceSyncArena.tsx`: accepts private-series context, shows readiness/comparison completion through SeriesPanel, and keeps private players out of the public next-stranger flow. `roundEngine.finishFaceSync()` finalizes comparisons without competitive points or scored-round donation prompts.
- `components/SeriesPanel.tsx`: private readiness, round ledger, points, final draw/winner, leave and manual support. Existing emoji/celebrity result and share cards embed this panel.
- `components/EmojiSkipDialog.tsx`: two explicit votes, pause explanation, response deadline, keyboard focus and decline/Escape.
- `context/SupportPromptContext.tsx`, `lib/supportPrompt.ts`, `components/ExperienceProviders.tsx`: completion-only automatic support, twelve-hour policy, safe results boundary, browser locking/storage fallback, and shared modal. `SupportModal.tsx` verifies destinations and preserves private games during checkout.
- `hooks/useMatchmaking.ts`: explicit public/private connection intent; v2 generations, round-only resets, verified PeerJS media assignment, readiness and voting. Arenas reuse their existing scorers and sampler. `useStableScoreSampler.resume()` retains paused samples; `useRoundClock` supports preparation/preview/pause/final-result transitions.
- `SoloFaceJudge.tsx` and `useExpressionScorer.ts`: one optional preparation inference before enabling the solo Start scan button, so cold tracker initialization occurs before the ten-second clock. Preparation does not collect scoring samples; the existing scorer gate still stops inference on results.
- `signaling-server/roundEngine.js`: shared v2 pair/attempt engine, FaceSync/target/media preparation, mutual skip, generation checks, completion and cleanup.
- `signaling-server/privateDuels.js`: authenticated router, participant socket ownership, readiness, public queue isolation, quotas, reconnect/deadlines and snapshots.
- `signaling-server/duelStore.js`: hashed invitations, serialized coordinator transitions, PostgreSQL seat/results transactions, local memory mode and bounded retention.
- `signaling-server/duel-schema.sql`: additive RLS/grants/constraints migration; loaded by `db.initSchema()`. `db.js` enforces verified production TLS without URL SSL overrides.
- `signaling-server/test/duels.test.js`, `test/privateFlow.test.js`, `test/duelsDb.test.js`: protocol/race/counter cases, real authenticated HTTP/socket flow, and explicit disposable PostgreSQL suite.
- `frontend/scripts/test-duel-policy.ts`, `scripts/verify-private-duel.ts`: policy/URL/timing checks and isolated two-player desktop/mobile browser flow with fake cameras and mocked checkout.

For the latest verification status and deployment prerequisites, read [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md). These changes add no runtime packages. Production database/payment checks are distinct from the passing local memory/browser checks.
