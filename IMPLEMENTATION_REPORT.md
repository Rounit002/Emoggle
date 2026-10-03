# Emoggle implementation report

Implemented locally on **2026-10-03**, with final verification continuing on **2026-10-04**, from the user-approved [implementation plan](IMPLEMENTATION_PLAN.md). No deployment or production payment was performed. Existing working-tree changes were preserved.

## Behavior delivered

- Visitors can browse without a name dialog. Choosing a game requests a name when needed; cancelling returns to browsing. Private invitation previews also allow browsing before joining.
- Compatible emoji players establish their assigned media connection first. The existing FaceSync lead-in runs, both clients acknowledge the target, and the emoji appears for **one second** before a full **ten-second** competition. Celebrity retains its existing three-second countdown.
- **Request emoji skip** opens a confirmation dialog on both screens, including the requester. Both distinct players must explicitly agree. Agreement replaces the target, resets the scoring attempt and grants a fresh one-second preview plus ten-second scan. The opponent, video/audio connection and chat remain the same.
- Declining or an eight-second response timeout resumes the existing target with its remaining time and samples. Three proposals per logical round and a five-second cooldown bound pauses. Skipped attempts do not consume a series round or trigger support.
- Optional support appears after **one completed scored round**, on the result/intermission screen. Another automatic prompt requires a completed round after **12 hours** since the previous display. Manual support stays available. Initial visits, cancelled rounds and standalone FaceSync do not trigger it.
- The homepage and game picker link to **`/1v1`**. Following the October 4 refinement, a single responsive setup screen combines a purple slider for **1, 3 or 5 rounds**, default **3**, with **Emoji Duel, Celebrity Face and Face Sync** radio cards. Name/invitation creation follows the explicit Create room action. The friend previews the rules before joining.
- Both players confirm readiness initially and between private rounds. All selected rounds are played against the same friend. Wins award one point, ties half a point each; equal final totals are a draw. Private matches are unranked and do not change ELO.
- Existing result/share cards, scorers, camera controls, chat/reporting, history and voluntary checkout are reused. Celebrity uses the existing bundled IShowSpeed Squint reference; this work does not expand its catalogue.
- Solo prepares one inference frame before enabling Start scan. This fixes a cold-start stall found during regression checks, without collecting lobby samples or changing the scoring formula. Result screens stop inference as before.

## Implementation and security

| Component | Purpose and enforcement |
| --- | --- |
| `roundEngine.js` | Separates the persistent pair from scoring attempts. Owns media/target preparation, authoritative preview/scan/pause schedules, explicit consent, score windows, finalization and timer cleanup. |
| Attempt IDs and schedule generations | Reject late scores, votes and callbacks from a cancelled attempt or an earlier schedule. Readiness also has its own generation to reject replayed confirmations between rounds or after reconnecting. |
| Assigned PeerJS pair and media nonce | Incoming calls must match the assigned peer, pair ID and server-issued nonce. Old call callbacks cannot replace a newer stream. These checks protect assignment; they do not make browser-supplied expression scores a trusted competitive measurement. |
| `privateDuels.js` | Authenticated HTTP/socket actions, participant-relative snapshots, current socket ownership, public-queue isolation, quotas, reconnect and inactivity deadlines. Private clients never fall through to stranger matchmaking. |
| `duelStore.js` and Node crypto | Twelve cryptographically random base-32 room-code characters (60 bits); only SHA-256 digests are stored. Codes expire in fifteen minutes and reserve one guest. Case/separators are normalized; auth, origin checks, per-IP API limits and per-user lookup limits remain enforced. Self/third/outsider joins are rejected; regeneration revokes the preceding code. Existing fragment invites remain accepted for compatibility. |
| PostgreSQL transactions | Guest claiming locks the invite and conditionally reserves the empty seat. A unique series/round ledger and transaction record the match and points once. Coordinator transitions are serialized in the current single server process. |
| `duel-schema.sql` | Additive tables, foreign keys, fixed round/mode constraints, unique results, RLS and revoked PUBLIC/browser-role grants. Existing tables are not dropped. The backend role must own the tables or have the intended privileged server access. |
| `db.js` | Production TLS verifies certificates, optionally using `DB_CA_CERT`. Connection URL SSL parameters cannot override the explicit verification configuration. Private creation fails closed when production persistence is unavailable. |
| Existing auth/origin/rate-limit infrastructure | Session identity authorizes seats and actions; names/device IDs do not. New HTTP endpoints and socket events retain origin, input and rate checks, plus feature-specific quotas and bounded retained state. |
| Shared support provider | Canonical completion IDs are deduplicated; validated storage keeps bounded history/counts and a twelve-hour display cooldown. Browser locks/storage/BroadcastChannel coordinate tabs. When those APIs are unavailable, cross-tab coordination is best effort and fallback is per tab. Storage never authorizes a game action or payment. |
| Existing Dodo checkout/webhook | The modal permits only HTTPS checkout URLs on the two exact live/test Dodo checkout hosts. Private checkout presents an explicit `noopener noreferrer` new-tab link so the game tab remains open. Existing signed, idempotent webhooks remain the payment authority. |

No runtime dependencies were added. React/Next.js, Express, Socket.IO, PeerJS, MediaPipe, Node crypto, pg/PostgreSQL and the existing Dodo SDK provide the implementation.

## Lifecycle limits

- Invite expiry: **15 minutes**; private series lifetime: **90 minutes**.
- Reconnect grace: **30 seconds**, with renewed readiness and a fresh attempt for an interrupted unfinished round.
- Lobby/intermission inactivity: **120 seconds**. Camera/target preparation has a bounded retry/error window and an absolute preparation deadline; retries cannot extend it indefinitely.
- Leaving ends the private series. A server restart aborts unfinished durable series rather than reconstructing live media/timers. Private invitations cannot silently connect someone to a public player.
- The implementation requires **one signaling coordinator**. Multiple replicas need shared coordination before they can safely manage these live series.

## Verification

| Check | Result |
| --- | --- |
| Backend unit suite | **Passed: 56 tests**, including consent/races, every 1/3/5 round count in both modes, invite/ledger memory behavior, stale readiness, production fail-closed behavior, TLS URL override protection and existing authentication/scoring/moderation checks. |
| Real authenticated HTTP/Socket.IO private flow | **Passed:** missing session, outsider/self access, concurrent guest claim, public isolation, readiness, mutual skipping, reconnect and leave. Uses the local development memory fallback. |
| Two isolated desktop/mobile browser contexts | **Passed:** fresh browsing, setup/name gate, fragment removal/guest preview, fake-camera readiness, both skip dialogs, two-vote restart, completed series and first-round support dismissal. Mocked checkout verifies the allowed new-tab link and preservation of the game tab. |
| Frontend TypeScript | **Passed.** |
| Focused ESLint | **Passed** for the new feature components, provider, libraries, updated matchmaking/clock/sampler hooks and feature verification scripts. |
| Production Next.js build | **Passed:** optimized bundle, TypeScript and all 21 generated route entries, including `/1v1`. |
| Frontend support/URL/schedule policy and sampler | **Passed**, including first completion, duplicate suppression, twelve-hour threshold, unsafe checkout destinations and preserved remaining duration. |
| Existing frontend clock, country, reaction and FaceSync suites | **Passed** during this implementation session. |
| Existing share-card browser capture | **Passed:** non-blank 1080 × 1350 PNG, valid image data and colour variation. |
| Existing celebrity server flow | **Passed**, including pairing, wait/retry, shared schedule, submissions, duplicate protection and cross-mode transfer. |
| Existing FaceSync server flow | **Passed: 47 checks, 0 failures.** A startup attempt failed before a subsequent successful rerun. |
| Solo browser regression | **Passed:** initial round, countdown, score/results, first-round support dismissal and replay; no uncaught page errors. Two initial runs exposed a cold first-inference delay (16.6/17.3 seconds). After the preparation fix, the initial/replay checks completed in 11.1/10.7 seconds, within the existing timing bounds. |
| Whole-project ESLint | **Still fails on existing source/script violations.** This was already failing before implementation; broad lint cleanup is outside this change. Focused checks above pass. |
| Real PostgreSQL migration/claim/ledger/rollback suite | **Skipped:** `DUEL_TEST_DATABASE_URL` is unset and configured database authentication is rejected. The suite is included; memory tests do not establish PostgreSQL behavior. |
| Real staging Dodo checkout/webhook | **Not performed.** UI checkout was mocked; no production payment was attempted. |

Browser tests use synthetic cameras. The private two-player test prevents external face-model loading, so it verifies UI/media/protocol behavior rather than expression recognition accuracy or real-world network/TURN performance. Model/scorer unit checks and the existing scoring algorithms remain separate evidence.

## Local use and production prerequisites

October 4 deployment update: the Vercel preview build passed and the deployed slider/game selections were verified. Backend Git auto-deployment was attempted, but its production readiness probe failed, so it was rolled back. The previous backend's HTTP 200 readiness was verified. The new frontend has not been promoted to production. See [DEPLOYMENT.md](DEPLOYMENT.md) for release URLs, commits and the required Render-account access.

The frontend runs at **http://localhost:3000/**; invite setup is **http://localhost:3000/1v1**. The signaling service runs on **http://localhost:3001**. Local sessions and matches use development memory because the configured PostgreSQL password is rejected. This mode loses state on server restart and does not prove durable reports, payments or database security. `/health` can be healthy while `/ready` reports the missing persistence.

Before production rollout:

1. Supply working database credentials and the correct CA configuration. Run `npm run db:init` with the server role, then inspect the additive private schema, RLS/grants and verified TLS against that database.
2. Use a **disposable initialized PostgreSQL database** for `DUEL_TEST_DATABASE_URL` and run `npm run test:duels-db`. This exercises independent concurrent seat claims, unique ledger accounting, rollback and browser-role grants. Do not point it at production data.
3. Run the existing checkout and signed/idempotent webhook against configured **Dodo test mode**. Confirm CSP/origins, exact checkout hosts and return configuration. Mock UI tests do not prove provider integration.
4. Keep a single signaling coordinator, verify HTTPS/origin/proxy settings and test actual cameras, two devices and the production relay/network path.
5. Deploy compatible server support before the frontend. Independently control `FEATURE_PRIVATE_DUELS`, `FEATURE_MUTUAL_EMOJI_SKIP` and `NEXT_PUBLIC_FEATURE_AUTO_SUPPORT`. Disabling private creation lets active compatible series reconnect/finish/leave; disabling automatic prompts leaves manual support; disabling consent never restores unilateral replacement.

The latest architecture and file navigation are in [ARCHITECTURE.md](ARCHITECTURE.md) and [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md). Environment examples include the feature flags, CA and disposable database test inputs; actual secrets were not changed.

## October 4: unified setup and private Face Sync

Round and game selection now share one screen with a distinct purple slider, clear selection outlines, a live selection summary and responsive game cards. Keyboard Home/End/arrow navigation selects 1/3/5 rounds. Browser checks at 320, 390, 768 and 1440 pixels confirm there is no horizontal overflow; phone cards stack and desktop cards align in three columns. Reduced-motion preferences disable card movement.

Face Sync is now a working private series mode. Each selected round is a shared resemblance comparison, followed by both-ready gating before the next comparison. The same cameras and chat persist. There are no competitive points, winner, ELO changes or automatic scored-round donation prompts. Missing-face outcomes complete the comparison without inventing a resemblance result. Authenticated seats, invite expiry, stale attempt/generation rejection and public-queue isolation remain enforced.

The SQL migration upgrades the existing `duel_series_game_mode_check` to include `facesync`; run the normal schema initialization when deploying. It also remains valid on a fresh database. The real PostgreSQL suite now checks Face Sync acceptance, unknown-mode rejection and repeated migration, but execution still requires working disposable database credentials.

Verification for this refinement: **57 backend unit tests passed**, including 1/3/5 Face Sync series, readiness, stale samples, duplicate completion and zero competitive points. **Two-player Face Sync and Emoji browser flows passed**, including three comparisons, slider keyboard controls, invite/name/media readiness, and existing emoji skip/support behavior. **TypeScript and the production build passed.** Browser cameras are synthetic and Face Sync browser checks exercise unavailable-face handling; valid vector computation and round completion are covered by server tests.

The authenticated HTTP/socket smoke test also passed on an isolated local server. An earlier attempt on the shared development server exhausted its session-bootstrap rate limit after repeated browser runs; the test now checks bootstrap status explicitly. The isolated server was stopped afterward, and the normal local signaling service was restarted with fresh development state for manual review.

## Room codes

Private setup now creates a room code instead of a room link. Guests use the same `/1v1` page to enter the code, preview the host’s rounds/game, and join after the existing name gate. The room code is shown in host setup and the camera lobby, including Celebrity Face; hosts can copy or regenerate it. Invalid/expired codes allow returning to setup and trying another code. No database schema change or runtime dependency is needed.

Verification: 57 backend unit tests and the real HTTP/socket flow passed with formatted lowercase codes. The two-context desktop/mobile browser flow passed through code entry, preview/name gate, camera readiness, mutual skip, completed series and support behavior. TypeScript, focused ESLint and the production build (21 routes) passed. Production rollout remains blocked as recorded in DEPLOYMENT.md.
