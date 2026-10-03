# Emoggle implementation plan

Prepared **2026-10-03** against the current working tree and [ARCHITECTURE.md](ARCHITECTURE.md) / [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md).

**Status: approved and implemented locally on 2026-10-03.** See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) for the final implementation, checks and external deployment prerequisites. Timing, donation frequency, and round choices incorporate the user's follow-up answers; remaining proposed rules are labelled for review.

## 1. Requirements and proposed behavior

| Requirement | Planned behavior | Acceptance condition |
| --- | --- | --- |
| Both people must agree to skip an emoji. | One player requests a different target; both players receive confirmation popups and explicitly agree or decline. The server changes the target only after two distinct participants agree. | One player's request, silence, or duplicate clicks cannot change the emoji. Both screens receive the same replacement and schedule. |
| Ask for support after a completed round. | Confirmed: after the first completed scoring round, at a result/intermission screen. Show again after a completed round once a 12-hour cooldown has elapsed. The prompt is optional. | No automatic support prompt on first arrival, name entry, matchmaking, countdown, scanning, or an unfinished/cancelled round. Dismissal allows free play immediately. |
| Add invite-link 1v1. | Add a homepage 1v1 section and an entry from the game picker. Host chooses round count, then game type, enters a name if needed, and creates a link. Friend joins; both become ready; the series starts. | Exactly two authenticated seats play the configured number of rounds with the same opponent. Public matchmaking cannot supply another player. |
| Integrate with existing features. | Reuse the existing arenas, scoring algorithms, camera handling, timing, chat/reporting, result/share cards, history, session bootstrap, and support checkout. | Public emoji, celebrity, solo, FaceSync, names, browsing, manual support, and cross-mode transfer continue to work. |
| Include security. | Enforce identity, room membership, consent, round identity, quotas, invitation expiry, and series state on the server; preserve payment verification. | Forged requests, expired links, outsiders, replayed scores, and concurrent joins cannot modify another game or payment state. |

A **round** means one completed scored challenge. An agreed emoji replacement restarts the current challenge and does not consume another round. A private series is a fixed number of completed rounds, not a best-of contest that ends early.

### Confirmed requirements from follow-up answers

1. **Initial emoji timing:** players connect first. Show the target emoji, then wait **one second** before starting the competition timer. Socket pairing alone must not start the timer before both players can participate.
2. **Emoji skipping:** a skip request opens a confirmation popup for **both** players. After both agree, replace the emoji and start the competition again. The same one-second target preview applies to the replacement.
3. **Support:** first prompt after **one completed round**; subsequent prompts after a completed round when **12 hours** have elapsed since the last prompt. This applies while people keep playing; no seven-day delay.
4. **1v1 rounds:** **1, 3, or 5**, default **3**.

### Additional rules included in the approved plan

- The skip confirmation pauses the current challenge for a bounded response window. If either person declines or times out, resume its remaining time; if both agree, restart with the new emoji and a full scan. This avoids losing playing time while a modal covers the game.
- Initial private types: **Emoji Duel** and **Celebrity Face**. Solo has one player; standalone FaceSync has no scored series winner. Additional/mixed types need explicit round/winner rules.
- Series scoring: one point for a round win, half a point each for a tie; equal final totals produce a draw. Play all selected rounds.
- Donation-counted completions: solo, public emoji/celebrity, and private scored rounds. Standalone FaceSync reveals do not count.
- Private readiness: both explicitly confirm after joining and between rounds. This allows camera permission, result reading, and dismissing support.

These rules were implemented with the approved plan and can be revised in a subsequent change.

## 2. What the current code already does

| Existing implementation | Consequence for this work |
| --- | --- |
| `ModeSelect.tsx` opens the picker first and prompts for a name after game selection. Visitors can cancel back to browsing. | Preserve this flow; the 1v1 setup and guest invitation preview must also be browsable before name entry. |
| `change_emoji` currently changes the target unilaterally and only before `emojiLocked`. Its arena control is hidden on mobile. | Replace the unilateral handler with a consent request; add an accessible mobile control and opponent response. |
| `useMatchmaking.ts` handles all multiplayer modes and automatically emits `join_queue`. | Private sessions need an explicit connection intent that never automatically joins the public queue. |
| `startMatch()` establishes the pair, FaceSync/countdown/scan timers, and peer roles. | Share this round engine with private duels instead of creating another scorer or timer implementation. |
| `finalizeMatchResult()` sets `resultSent`, persists scores, emits a result, then calls `clearMatchState()`. | Separate per-round cleanup from pair/series cleanup so a private opponent and media connection survive between rounds. |
| `skip_user`, stop, and disconnect can automatically requeue the other player. | Add private-membership guards to these handlers and every delayed enqueue callback. |
| Support state is in `HomeExperience`; `SupportModal` currently renders inside the home `ModeSelect`. Checkout navigates the current tab. | Move support ownership/rendering to the reusable experience layer so result screens can open it. Private checkout must preserve the game tab. |
| Multiplayer completion uses immutable `match_result`; solo completion has a once-only `finishRound()`. | Use these completion points to count rounds, not local timer ticks or mount effects. |
| Celebrity matchmaking currently selects only the bundled IShowSpeed Squint pilot. | Private celebrity rounds use the same supported target. More rounds do not imply additional references or new celebrity assets. |
| Sessions and signaling players are independent of Supabase name profiles. | Use signaling identity for invite ownership and seats. A name, device UUID, or Supabase profile is not authorization. |

The local backend currently falls back to memory because database authentication was rejected. Local flow tests can use isolated memory state, but production persistence/security checks require a working database.

## 3. Implementation structure and tools

| Existing tool/module | Use |
| --- | --- |
| React/Next.js client state and dynamic imports | Setup, invite preview, readiness, skip voting, support prompt, and series UI. Load arenas after selection/name/readiness. |
| Existing Express service | Authenticated create/join/read/cancel/regenerate invitation APIs and feature capability reporting. |
| Existing Socket.IO | Consent, readiness, authoritative round schedules, series snapshots/results, reconnect and leave events. |
| Existing PeerJS/WebRTC and optional TURN | Same two-person live video/audio connection across private rounds. |
| Existing MediaPipe scorers and sampler | Emoji mean and celebrity peak scoring, with reset for every new attempt. |
| `serverClock.ts` / `useRoundClock.ts` | Existing server timestamps, clock offset, countdown, scan duration, and score grace. |
| Node `crypto` | Random invite and media secrets, UUIDs, SHA-256 invite digests. No hand-made predictable invitation codes. |
| `pg` / PostgreSQL transactions and constraints | Seat reservation, durable series results, unique round accounting, and hashed invitation records. |
| Existing authentication, origin checks, validators, and rate-limit middleware | Apply to every new endpoint/event, with feature-specific quotas. |
| Existing Dodo SDK, checkout route, and signed webhook | Existing voluntary payment flow; no new payment service. |
| Safe browser storage helpers and BroadcastChannel | Prompt count/cooldown, deduplication, and cross-tab prompt coordination. Storage affects prompt UX, never game/payment authority. |
| Existing Node tests, TypeScript/ESLint, Puppeteer scripts | Protocol/race/security regression tests and desktop/mobile flow verification. |

No additional runtime package is planned. Extend the existing infrastructure with small modules rather than increasing the large server entry point with another monolithic feature.

## 4. Mutual emoji skipping

### Player flow

1. Either player clicks **Request emoji skip**.
2. The server creates one proposal and opens **Skip this emoji?** on both screens with **Agree** / **Keep this emoji**. Clicking Request alone is not consent; the requester confirms too.
3. Proposed response window: eight seconds. The server pauses the preview/scan while these dialogs are active and freezes score sampling.
4. A decline or timeout closes both dialogs and resumes the same attempt with its remaining preview/scan time and existing samples. No response never means agreement. Leave/disconnection clears the proposal and follows the match's cleanup rules.
5. Two distinct confirmations make the server choose a different supported emoji. Show it to both players for **one second**, then restart a full ten-second competition scan.
6. Keep the same opponent, camera/microphone streams, chat, and logical round number. FaceSync is not rerun for an emoji replacement.
7. Requests during the target preview or active scan use the same consent mechanism. Requests after the scoring/finalization boundary are rejected.

The existing **Next stranger**, **Leave**, and **Report** controls remain independent. A person can leave an unwanted interaction without the other player's permission. Private mode's equivalent is **Leave 1v1**, which ends/abandons that series instead of entering the public queue.

### Server authority and races

Add a consent module such as `signaling-server/emojiSkip.js`, keeping a single proposal per current attempt:

- Proposal ID, current match/attempt ID, requester user, explicit agreeing users, expiry, status.
- Verify both the sender's authenticated identity and membership in the current pair.
- A duplicated confirmation from one player remains one vote. Simultaneous requests share one proposal and two dialogs; neither request counts as confirmation. Both distinct users must confirm explicitly.
- Proposed limits: one pending proposal; five-second cooldown after each resolved proposal; at most three proposals per logical round, including declines/timeouts, to bound pause abuse. Apply socket/user rate limits too.
- Refuse new consent when the attempt is ending, finalized, superseded, or in FaceSync collection/reveal.
- Claim the transition synchronously before awaiting database work. A timeout, second acceptance, or score finalizer must observe that claim and cannot win a second transition.
- On opening a proposal, checkpoint the remaining time and pause scoring/finalization timers. Increment the schedule generation; ignore queued packets from the preceding generation. Stop browser samplers/publishing too.
- On decline/timeout, rebase deadlines for the preserved remaining duration and increment the schedule generation again. Do not clear samples or grant a fresh ten seconds on this path.
- On acceptance, cancel old timers and samples. Mark the old attempt cancelled and create a new match ID for the replacement attempt. Keep the logical round index unchanged.
- Timer closures and async persistence completions must check the attempt ID and state generation before emitting or clearing state.
- If restarting fails, surface a recoverable error/abort rather than broadcasting a schedule that the server did not establish.

### Protocol additions

Proposed events:

| Event | Required checks/data |
| --- | --- |
| `emoji_skip_request` | Current match ID, protocol capability, permitted phase; server generates proposal ID. |
| `emoji_skip_respond` | Proposal ID, match ID, explicit boolean; each participant can confirm only their own consent. |
| `emoji_skip_state` | Match ID, proposal ID, requester seat, expiry, status; only current participants receive it. |
| `round_restarted` | Old/new match IDs, logical round index, target, complete new server schedule. |

Stamp `live_score`, `submit_score`, schedule, partner-score, and result packets with attempt identity and schedule generation. Add authoritative paused/resumed schedule events; the browser clock must preserve remaining duration on resume instead of treating it as a fresh full scan. Reject late packets from the old attempt; client listeners also discard them. Reset submitted/finished refs, mean/peak sampling, local score, prediction anchors, and visible result on restart.

The old `change_emoji` event must never remain a unilateral bypass. Treat it as a consent request or return a nonfatal unsupported response. Rollout capabilities must ensure that a legacy client that cannot acknowledge/identify a restarted attempt never participates in mid-scan restart or private series.

### Initial connection and one-second preview

Add a server-controlled preparation phase for emoji duels. Require the assigned pair's media readiness (local stream plus assigned remote connection) before scheduling a competition. Readiness messages are authenticated, pair-bound, idempotent, and attempt/version-checked. Keep existing FaceSync collection/reveal ahead of the emoji challenge; it does not consume competition time.

Publish the target to both clients and receive target-ready acknowledgements before issuing the one-second preview schedule. The server publishes preview/scan boundaries; clients use ServerClock and the existing go anchoring/grace approach. A bounded readiness timeout (proposed 20 seconds) shows retry/leave rather than scoring a player who is still connecting. Preview a replacement target the same way after agreement.

Extend useRoundClock with preparing/preview/paused/resuming states, reset the local go anchor after accepted replacement, and preserve remaining time on a rejected skip. Update timing tests for these states. Keep the ten-second scoring duration, score formulas, and submission grace; only emoji's previous three-second countdown becomes the confirmed one-second target preview. Celebrity's existing countdown and standalone FaceSync rules stay as they are.

## 5. Automatic support prompt

### Trigger and frequency

Introduce a `SupportPromptProvider` plus a small `supportPrompt.ts` policy/storage module, shared by home and private experiences.

- Multiplayer completion: count only a canonical finalized `match_result`, deduplicated by match ID.
- Solo completion: generate a round ID at start; count once in the existing guarded completion path.
- Skipped/cancelled attempts, disconnects, previews, FaceSync lead-ins, and duplicate packets do not count.
- Confirmed threshold: **one completed scored round**; do not derive an immediate popup from historical matches on first load.
- Only display after the result is visible, with a short settled transition. Cancel/defer the timer if another game/countdown/scan/name dialog starts, the page is hidden, or another modal owns focus.
- In private series, display at the round-result intermission before that player clicks Ready. Both-ready gating prevents an unexpected next round underneath the dialog.
- If the threshold is reached without a safe result screen, retain eligibility until a later safe boundary.
- Record the display/cooldown before rendering. Dismissal, manual support display, or choosing to support counts as the opportunity for this cooldown.
- Cooldown is **12 hours** from the last display. If it expires during continuous play, the next completed scoring round makes the prompt eligible again. An idle clock expiry by itself does not open a dialog.
- Store validated bounded counts, a bounded deduplication list, and the last prompt timestamp. Synchronize updates across tabs; use an exclusive browser lock where available to avoid duplicate automatic displays. If locking/storage is unavailable, use a per-tab/session fallback with a documented best-effort cross-tab guarantee.
- Manual support buttons remain usable regardless of threshold/cooldown. Playing never requires a contribution.

### Checkout and modal coordination

Reuse `SupportModal`, its amount validation, session-authenticated endpoint, and signed webhook processing.

Private duels need special navigation handling: create checkout, then present an explicit **Open secure checkout** link in a new tab with `noopener noreferrer`. Do not navigate the game tab away mid-series. If checkout cannot open, offer retry or support after the series; continue to permit dismissal and play.

Validate returned checkout URLs as HTTPS URLs on the configured Dodo checkout host allowlist. Verify the actual configured test/live hosts during implementation; do not trust an arbitrary API URL as a navigation target. Existing ordinary support navigation can stay as it is.

Payment success remains established by the verified, idempotent provider webhook. A return URL, popup close, localStorage flag, or invite participant cannot mark a payment as successful.

Ensure only the top modal traps focus/scroll. Move support rendering out of `ModeSelect`; avoid rendering duplicate support dialogs in an arena and the homepage.

## 6. Invite-only 1v1 experience

### Host

`1v1 section -> number of rounds -> game type -> name if needed -> create invitation -> waiting lobby -> both ready -> game`

- Add a distinct **Invite a friend — 1v1** section on the homepage and an entry in the picker.
- New route: `/1v1`. Existing public mode IDs and queues remain emoji/celebrity/FaceSync.
- Select round count first, then Emoji Duel or Celebrity Face.
- Create a series only on an explicit action after valid name/session readiness.
- Show configured rules, Copy link, waiting status, Cancel, and Regenerate link.
- Rules lock after creation. Changing them requires cancelling/recreating before a guest joins.
- Regeneration revokes the previous link and is allowed only while the guest seat is empty.

### Guest

`open invite link -> see rules -> name if needed -> Join 1v1 -> camera/mic readiness -> both ready -> game`

- A read-only invitation preview displays game type/round count without starting camera or consuming the guest seat.
- Claim the guest seat only on explicit Join, with a valid name and authenticated signaling session.
- Explain expired, full, cancelled, incompatible, and unavailable invitations without falling into public matchmaking.
- Camera permission failures offer retry or leave; do not silently start scanning a player who is not ready.
- A link is permission to request the guest seat, not to control the host or inspect unrelated rooms.
- Anyone who receives a forwarded unused link can take that one guest seat. If named-person access is wanted later, that needs an account/verification flow beyond the current anonymous product.

### Series lifecycle

Proposed server states:

`waiting -> ready -> playing -> round_result -> ready -> ... -> completed`

Additional terminal/recovery states: `suspended`, `cancelled`, `expired`, `aborted`.

- Pair exactly the host and claimed guest, with server-assigned caller/receiver roles.
- Reuse the same media connection across rounds. Reset scoring/timing/results per attempt.
- Run the existing FaceSync lead-in once on initial emoji pairing; later rounds use the one-second target preview. Celebrity continues to skip the lead-in.
- Show **Round X of N**, each round result, cumulative points, and each player's readiness.
- Both Ready actions start the next round once. No unilateral Next/Play Again can replace the opponent.
- Server awards one point for a win / half each for a tie. Store integer half-point units to avoid floating-point ledger errors.
- Exactly-once completed-round records drive the scoreboard. An agreed emoji skip keeps X unchanged.
- Private series remain unranked even if public ELO flags are enabled; retain public ELO behavior.
- After N completed rounds, show final winner/draw, round breakdown, share/results and return-home actions.
- Reuse local history with optional series/match-kind fields; old entries remain readable. Only completed attempts are added.
- Preserve existing report behavior within active rounds; retain authenticated pair membership through intermission so reporting remains possible there. Resolve any post-round reporting gap explicitly with series-aware validation.

### Disconnect and leave

- Proposed reconnect grace: **30 seconds** for the same authenticated user/session. A new anonymous identity cannot take an occupied seat.
- Suspend the pair, cancel the incomplete attempt, and retain completed round results. Reconnecting requires both-ready confirmation and restarts that logical round with a new attempt ID.
- Duplicate/stale socket-disconnect callbacks cannot remove a seat that has already reconnected under a newer socket generation.
- After grace expires, mark the series aborted, show completed scores and the reason, and release both seats. Do not invent a win or completed round.
- Explicit leave cancels/abandons immediately. It never automatically queues either participant publicly.
- Proposed waiting invitation TTL: **15 minutes**; unready intermission timeout: **2 minutes**; total active series lifetime cap: **90 minutes**.
- An interrupted server process invalidates live sessions/attempts. On restart, mark previously active series interrupted/aborted; do not attempt to reconstruct camera calls or live timers from stored results.

## 7. APIs, state, and persistence

### Proposed HTTP endpoints

All responses use `Cache-Control: private, no-store`.

| Method/path | Purpose | Authorization |
| --- | --- | --- |
| POST `/api/duels` | Create series and initial invitation from allowlisted rules. | Authenticated signaling user; trusted mutation origin. |
| POST `/api/duels/invite-preview` | Read minimal rules/availability using invitation token in the body. | Authenticated session; trusted origin; strict rate limit. Does not reserve a seat. |
| POST `/api/duels/join` | Atomically claim the guest seat using invitation token. | Authenticated non-host user; valid unexpired invitation; trusted mutation origin. |
| GET `/api/duels/:seriesId` | Read authorized series snapshot. | Host or already-claimed guest only. |
| POST `/api/duels/:seriesId/invite` | Regenerate unclaimed invitation. | Host only; waiting/empty guest seat. |
| POST `/api/duels/:seriesId/cancel` | Cancel setup/series. | Host; appropriate current state. Participant leave is a separate validated action. |

### Proposed Socket.IO events

`private_join`, `series_ready`, `series_sync`, `series_leave` receive bounded, validated payloads. Emit versioned `series_state`, `round_started`, `round_result`, `series_result`, and structured nonfatal errors.

Bind sockets to server-recorded users and seats. A supplied room/series/match ID only selects a candidate record; it never authorizes the action. Reconnection obtains a current snapshot with monotonically increasing state version. Ignore old snapshots/events on the client.

### New database records

Use raw SQL through `pg`, consistent with the active code; do not switch to historical Prisma.

| Record | Fields/invariants |
| --- | --- |
| `duel_series` | UUID, host/guest user IDs, game mode, total rounds, state/version, current round, half-point totals, creation/expiry/completion timestamps. Host and guest must differ; mode/count/state constraints. |
| `duel_invites` | SHA-256 token digest, series ID, generation, expiry, consumed/revoked timestamp. Never store the raw link secret. |
| `duel_series_rounds` | Series ID, logical round number, completed match ID, participant scores, winner, timestamps. UNIQUE(series ID, round number) and UNIQUE(completed match ID). |

Join uses a transaction/row lock (or equivalent compare-and-set) to consume one valid invitation and fill one empty seat. Only one of two simultaneous guests can succeed. Return an idempotent success for a retry by the already-claimed same guest; reject another user.

Round persistence, point totals, and series advancement use a transaction and unique constraints. Keep socket/event transition ownership across awaits. Database failure must not emit a durable series win or advance twice.

Use additive schema setup/migration, indexes for token digest/expiry and series membership, and a corresponding standalone SQL migration. Production private sessions require persistence; development may use an explicit isolated memory implementation of the same store contract. Do not silently downgrade production private series to memory.

Set explicit database permissions on the new tables: revoke direct access from PUBLIC and browser-facing anon/authenticated roles where those roles exist; enable RLS with no browser access policies. Use the trusted backend's existing server-only database role with the required owner/privilege configuration. Verify the actual grants and backend access in the migration tests rather than assuming Supabase defaults protect a newly created table.

Invitation cleanup runs with bounded batches. Proposed private-record retention is seven days after a terminal state; remove dependent private rows safely. Do not change existing general match/history/payment retention as part of this feature.

Live round timers, votes, vectors, and sockets remain on the current single signaling process. Deployment must route HTTP and sockets to that same coordinator. PostgreSQL alone does not make multi-replica matchmaking safe. Shared coordination/Redis would be a separate scaling change.

## 8. Security controls and their purpose

| Risk | Planned control | Verification |
| --- | --- | --- |
| Guessing invitation URLs | `crypto.randomBytes(32)` encoded base64url; exact length/character validation; SHA-256 digest lookup. | Malformed, short, random, expired, and revoked secrets fail. |
| Invitation disclosure | Link shape `/1v1#invite=<secret>`; fragment is not in HTTP requests. Capture only in the client, remove from visible history, retain temporarily in tab storage for the join flow, then clear. Never log/copy it into analytics/errors. | Inspect browser requests/logs; no secret in query/path/referrer or snapshots. |
| Public indexing/cache of private state | Generic route metadata with noindex/nofollow, omit private links from sitemap, existing no-referrer policy, no-store API responses. | Preview crawler/metadata and cache headers. Robots directives are not authorization. |
| Impersonation/room takeover | Existing bearer/socket authentication plus host/guest membership checks on every action. No authorization by name, device ID, seat label, or supplied user ID. | Outsider guesses series ID; forged host/guest/round IDs fail. |
| Reused link / third player | Atomic consume/guest-seat reservation, generation/revocation checks, two-seat invariant. | Simultaneous joins, repeated redemption, host self-join and late third participant tests. |
| Cross-site actions | Existing mutation-origin checks and strict CORS; verify Socket.IO/WebSocket handshake Origin against trusted origins. CORS alone is insufficient for socket authorization. | Disallowed browser origin fails; test clients set explicit trusted origins. |
| Consent spoofing | Proposal bound to match ID and two distinct authenticated participants, expiry, one transition claim. Legacy change event cannot bypass consent. | Duplicate self-votes, forged opponent IDs, old proposals, and concurrent votes fail/commit once. |
| Stale scores after emoji replacement | New attempt ID, generation-guarded timers, identity on all new-protocol score/result messages; clear old samples/submissions. | Old live/final/partner/result packets cannot affect the replacement round. |
| Queue contamination | Private membership checked in queue entry, transfer, skip, stop, disconnect and delayed requeue callbacks. Invalidate pending public joins before claiming private membership. | Outsider/public queue player cannot enter a private pair; private leave never queues automatically. |
| Unwanted media calls | Accept/answer only the assigned peer in the current authorized pair, with a separate server-issued per-pair media nonce carried in call metadata. Reject unknown/stale calls before attaching the local stream. Reissue on re-pair/reconnect. | Unassigned peer, guessed ID, stale nonce and delayed incoming call are rejected. |
| DoS / unbounded room state | Existing HTTP/IP/socket/packet limits plus per-user create/join/vote/ready quotas, one live private membership, room cap, TTLs and bounded sweeps. | Flood, repeated unique tokens, expired-room sweep and resource-release tests. |
| Replayed/multiple results | Existing finalization guard plus state version and database unique round constraints. | Deadline/submission/leave/skip races award at most one result/ledger entry. |
| SQL/XSS/unsafe redirects | Parameterized SQL; validate enum/int/string fields; render names/chat as text; allowlist checkout HTTPS hosts; invite URL generated from a trusted site base URL. | Invalid type/oversize payload, hostile text, and injected URL tests. |
| Camera/name privacy | Explicit media permission; existing camera cleanup; no new image/video recording. FaceSync vectors retain their existing ephemeral lifecycle. Private logs contain safe event codes/IDs, not tokens or vectors. | Leaving/expiry releases tracks/timers; logs inspected for secrets. |
| Fake donation receipt | Existing signed Dodo webhook, event/payment deduplication and server amount validation. UI prompt/cooldown has no payment authority. | Existing payment validation plus duplicate/invalid-webhook scenarios in a test environment. |
| Persistence trust | Explicit grants/revocation and RLS prevent browser roles from reading private tables; authenticated membership gates the backend API. Verified database TLS for production deployment. | Backend access succeeds; anon/authenticated direct-table access fails; DB authorization/TLS configuration review and real-database tests. |

Proposed initial quotas: three series creations per user per minute, twenty preview/join attempts per user per minute, one active private membership per user, three invitation regenerations per minute, and existing socket packet ceilings. Apply per-IP limits as well; validate/tune these with the existing same-network two-player limits so ordinary friends are not blocked.

**Known security limits:** browser-produced expression scores remain forgeable by a modified client. The new server rules secure pairing, consent and accounting; they do not establish trusted face inference. Private games therefore remain unranked. A bearer invite permits its holder to claim the guest seat. The existing production database configuration disables certificate verification; verified TLS and successful DB authentication are prerequisites for production approval of durable private sessions.

## 9. Planned file changes

Exact names may adjust during implementation; responsibilities stay as follows.

| Area | Planned files |
| --- | --- |
| Landing/setup/name entry | `ModeSelect.tsx`, `ChooseGameMode.tsx`, `HomeExperience.tsx`; new `app/1v1/page.tsx`, `PrivateDuelExperience.tsx`, `PrivateDuelSetup.tsx`, `PrivateDuelLobby.tsx`. Preserve the existing NameEntryModal validation. |
| Reusable providers/support | New experience-provider wrapper, `context/SupportPromptContext.tsx`, `lib/supportPrompt.ts`; `SupportModal.tsx` moved to common ownership with private checkout navigation mode. |
| Arena integration | `DuelArena.tsx`, `CelebrityDuelArena.tsx`, `SoloFaceJudge.tsx`; new `EmojiSkipConsent.tsx`, `SeriesRoundPanel.tsx`, `SeriesResultScreen.tsx`. Shared arena props choose public or private behavior. |
| Transport/lifecycle | `useMatchmaking.ts`, `serverClock.ts`, `useRoundClock.ts`; new private-series hook/types. Extend transport intent/capabilities, attempt reset and event filtering; reuse camera/PeerJS logic. |
| Storage/history | `storage.ts` plus prompt policy; optional backward-compatible private history fields, bounded deduplication and cooldown values. |
| Backend orchestration | `signaling-server/index.js` plus small `emojiSkip.js`, `privateDuels.js`, `duelStore.js`, and `routes/duels.js`; extract only round helpers needed for restart/series reuse. |
| Persistence | `db.js` and additive standalone SQL migration for private tables. `matchScore.js` retains public scoring; private finalization explicitly avoids ELO updates. |
| Security/config | Existing authentication/origin/IP modules as needed; media-call checks; documented quota/TTL/feature configuration. No actual secrets in examples. |
| Verification/docs | Backend consent/private lifecycle/race tests, frontend policy/reset/browser flow checks, environment examples, ARCHITECTURE and CODEBASE_GUIDE updates after implementation. |

Do not wire the unused `useCelebrityMatchmaking.ts` or dormant UploadJudge as alternative paths for these features.

## 10. Implementation sequence after review

1. **Confirm reviewed rules and capture baseline.** Preserve current local edits. Run existing relevant checks and record existing lint failures. Add feature capability negotiation and test fixtures.
2. **Introduce attempt/lifecycle boundaries.** Separate round cleanup from pair cleanup; add attempt identity/generation and sampler/clock reset, media/target readiness, and the one-second emoji preview. Keep current public pairing/scoring/FaceSync behavior covered by regression tests, with the explicitly requested emoji timing change.
3. **Implement mutual consent.** Server proposal/commit/cancellation, frontend desktop/mobile vote UI, old-event bypass prevention, restart and stale-packet tests.
4. **Implement support policy and shared modal.** Once-only completion callbacks, safe-boundary trigger, cooldown/cross-tab behavior and existing checkout reuse.
5. **Implement private store/APIs and pair lifecycle.** Additive schema, invitation/seat transactions, readiness, exactly-once series ledger, reconnect/expiry/leave, public-queue isolation.
6. **Implement 1v1 setup/lobby/arena/results.** Host/guest route, invite link preview, name flow, round/type choice, round panel, stable opponent/media, series summary and private checkout behavior.
7. **Run integration/security/browser checks.** Fix changes introduced by this work; record any unrelated existing failures rather than treating them as passing.
8. **Update architecture/guide and prepare review.** Summarize final behavior, schema/config, tests, and deployment prerequisites. Deployment is a separate step after implementation review.

## 11. Verification and regression gates

| Group | Required checks |
| --- | --- |
| Existing public games | Current server unit, celebrity and FaceSync flow suites; frontend scoring, sampler, clock, country/name and FaceSync tests; public queue/cross-mode transfer; solo; result/share/history. |
| Consent | Request/accept/decline/expiry; duplicate and simultaneous requests/confirmations; requester must confirm too; forged voter; maximum/cooldown; late vote; leave/finalization races; same opponent; skipped attempt does not count; both confirmation dialogs; bounded pause; decline/timeout preserves remaining time; one-second preview before initial/replacement scans; full new timer on acceptance; late scores discarded. |
| Support | First completed round, then the first completed round after a 12-hour cooldown; deduped result; skipped/incomplete round excluded; no first-load prompt; active-round deferral; cooldown/dismissal; reload/tab/storage-disabled behavior; manual support; checkout error; private game tab preserved. |
| Invite authorization | Missing/invalid session, malformed/expired/revoked token, self-join, outsider snapshot, third guest, concurrent joins, idempotent retry, untrusted origin, quota enforcement, token/log/referrer handling. |
| Series correctness | 1/3/5 configured rounds, both modes, wins/ties, fixed count, both-ready exactly once, no private ELO, private peer stability, result ledger uniqueness and persistence failure. |
| Cleanup/recovery | Explicit leave, disconnect/reconnect, duplicate tabs/socket generations, expired lobby, timer/sweep races, cancelled attempt, server restart, camera failure; no surprise public requeue. |
| Browser UI | Fresh and saved-name visitors; host setup order; guest rule preview; invite copy; mobile buttons/vote/ready/dialog focus/scroll; reduced motion; clear invalid-link/errors; simultaneous two-browser sessions. |
| Tooling/deployment | TypeScript; focused lint and production build; new unit/integration suites; real PostgreSQL constraint/migration tests; configured staging Dodo checks where available; allowed-host/Origin/TLS configuration. |

Real PostgreSQL tests must accompany memory tests: a Map cannot prove row locks, constraints, transaction rollback, or persistence. Never run payment production transactions or change production data as a routine test.

## 12. Rollout and rollback

Use independent capability flags for private duels, mutual skipping, and automatic support prompting. Deploy server support first, then the matching frontend, then enable each feature after checks. Require compatible clients for private series and active-scan restart; preserve ordinary public gameplay during mixed-version rollout. Gate media-ready/target-ready preparation on compatible clients; legacy pairings must not enter a preparation phase they cannot acknowledge.

When consent is unavailable, hide/disable target replacement rather than reverting to unilateral mutation. Turning off automatic prompting keeps manual support. Turning off new private creation leaves already-active compatible series able to finish or terminate cleanly.

Schema changes are additive; rollback does not drop old matches, profiles, payments, or completed series records. Keep existing public routes, mode IDs, score formulas, ten-second scoring duration/grace, name gating, and payment authorization intact. Emoji preparation/preview timing changes only as explicitly requested.

The initial production rollout stays on the current single signaling coordinator. Multi-replica routing, expanded celebrity assets, broad lint cleanup, competitive anti-cheat, and new game types are separately scoped work.

## Review checklist

- Verify the confirmed one-second emoji preview, both-player confirmation, first-round donation/12-hour cooldown, and 1/3/5 round choices.
- Confirm initial private types, fixed-round points/draw rules, and both-ready behavior.
- Confirm invitation/reconnect limits and public/private separation.
- Confirm the security and verification gates.
- Implementation was authorized by the user. The report records the final modules and verification status.
