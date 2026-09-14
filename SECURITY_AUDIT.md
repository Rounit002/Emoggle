# FitCheckDuel / Emoggle Security Remediation Report

**Initial audit:** 2026-08-10 (Asia/Calcutta)  
**Remediation pass:** 2026-08-10  
**Scope:** `frontend/`, `signaling-server/`, `ai-judge/`, database schemas, dependency manifests, CI, and repository hygiene

## 2026-09-15 pass — abuse resistance and dependency advisories

Triggered by a report of automated traffic against the live site. Scope was the
paths a bot actually drives: connection throttling, per-event limits, and
anything in the dependency tree that turns ordinary traffic into an exploit.

### Fixed

**Forwarded-header spoofing defeated every per-IP socket limit.**
`socketClientIp()` read the *leftmost* `X-Forwarded-For` entry. That entry is
written by the client, not by the proxy — each proxy appends its view of the
caller to the end of the list. Under the production default of one trusted hop,
a caller sending `X-Forwarded-For: <random>` produced `<random>, <real IP>` and
the server keyed its rate-limit state on `<random>`. Both socket abuse
controls — the 30-handshakes-per-minute throttle and `MAX_CONNECTIONS_PER_IP` —
were bypassable by varying one header, and because handshake verification runs
a session lookup, the bypass reached the database. Hop counting now runs
right-to-left, matching how Express resolves `req.ip` under `trust proxy`, and
falls back to the socket peer address when the chain is short or the selected
entry is not a well-formed address. Extracted to `signaling-server/clientIp.js`
and covered by 13 regression tests in `test/clientIp.test.js`.

**Unrecognised socket events were unmetered.** The per-event table had no
catch-all, so `socket.emit("anything")` was decoded and dispatched for free. A
global budget of 240 packets per 10s per socket now applies to every event name.

**Rate-limited sockets stayed connected.** A rejected packet returned an error
and left the socket open, so a client that ignores errors could keep paying the
cost indefinitely. Twenty violations now close the connection.

**Unauthenticated routes outside `/api` had no ceiling.** `/`, `/health` and
`/ready` — the cheapest paths to flood — were unlimited. A global limiter of 300
requests per minute per IP now covers every HTTP path, well above real browser
and platform-health-check usage.

**Expired sessions were only swept at startup.** A long-running process kept
every anonymous session it ever issued, which is storage a session-spamming bot
can grow on demand. An hourly sweep now runs against the existing
`idx_sessions_expires_at` index.

**Handshake bookkeeping was unbounded.** The per-IP attempt map is now capped at
50,000 addresses, shedding new arrivals when the periodic prune falls behind.

### Dependency advisories cleared

| Component | Advisory | Resolution |
|---|---|---|
| frontend | Next.js unauthenticated RCE on Windows-hosted servers (GHSA-p293-qw3h-jr36) — **critical** | `next` 16.3.0 → 16.3.5 |
| frontend | Next.js RCE in the Image Optimization API via AVIF (GHSA-2xp9-vwfh-vxw4) — **critical** | same upgrade |
| frontend | `sharp` libheif vulnerabilities (GHSA-rgj7-g3m4-5g8c) — high | transitive upgrade |
| frontend (dev) | `extract-zip` symlink path traversal and arbitrary file write | `puppeteer-core` → 25.11.0 |
| frontend (dev) | `js-yaml` CPU exhaustion via empty merge sources | transitive upgrade |
| signaling-server | `qs` denial of service and array-limit bypass (GHSA-4mjr-xmp4-gh2g, GHSA-x5fp-wj9c-mxmx) | `express` 4.22.2 → 4.22.3 |

`npm audit` reports zero vulnerabilities in both Node components. The Python
service was already on pinned current releases and needed no change.

### Verification

- Signaling unit tests: 28 passed (13 new).
- Signaling end-to-end matchmaking smoke test: passed.
- Frontend production build on Next.js 16.3.5: passed, TypeScript clean, all routes.
- `npm audit` frontend and signaling-server: 0 vulnerabilities.

### Still open after this pass

1. **TURN credentials are shipped to browsers.** `NEXT_PUBLIC_TURN_USERNAME` and
   `NEXT_PUBLIC_TURN_CREDENTIAL` are static values embedded in client bundles, so
   anyone can extract them and relay their own traffic through the TURN server at
   your expense. This is the most likely remaining lever for a motivated abuser
   and it cannot be fixed in application code alone: it needs an endpoint that
   mints short-lived HMAC credentials per session, which most managed TURN
   providers support.
2. **Rate-limit state is per-process.** Every limiter here is in-memory, so the
   effective budget multiplies by the instance count. Move to a shared store
   before scaling horizontally.
3. **Edge protections are not application code.** A volumetric flood should be
   absorbed before it reaches the origin. Put the signaling server behind a
   proxy with WAF and bot management rather than relying on these limits alone,
   and confirm `TRUST_PROXY_HOPS` matches the real number of proxies once you
   do — the hop-counting fix above depends on that value being accurate.
4. **Orphaned anonymous users persist.** Session rows are now swept, but the
   `users` row created alongside each one is not. Pruning needs a retention
   decision first, since it discards ELO for anyone who returns.

---

## Executive conclusion

The high-risk application flaws found in the initial review have been remediated in the working tree. Anonymous users now receive authenticated server-side sessions, Socket.IO identity is derived from those sessions, user-specific APIs no longer accept a user ID from the browser, premium endpoints are server-authorized, the AI judge is private behind the signaling service, and known dependency advisories were reduced to zero in all three application components.

Ranked ELO remains disabled by default because expression scores are produced in the browser. Browser-generated scores are not suitable for a trusted competitive ranking without a server-side scoring design. This is now a fail-safe product constraint rather than an exploitable default.

**Code risk after remediation: MEDIUM**  
**Deployment status: requires configuration and redeployment before these controls protect production**

## Implemented controls

| Area | Status | Implementation |
|---|---|---|
| Anonymous authentication | Implemented | `POST /api/session` creates a cryptographically random bearer token and user; only its SHA-256 hash is stored. Sessions expire after seven days. |
| Session transport | Implemented | `HttpOnly`, `Secure` production cookie plus an ephemeral `sessionStorage` token for authenticated cross-origin Socket.IO handshakes. |
| Logout/revocation | Implemented | `DELETE /api/session` deletes the stored token hash and clears the cookie. |
| Authenticated user lookup | Implemented | `/api/users/me` derives identity from the verified session; the public `?id=` lookup was removed. |
| Socket authentication | Implemented | `io.use(verifySocketToken)` verifies the session and binds `socket.user`; `join_queue` no longer accepts user identity or country from the client. |
| Concurrent session abuse | Implemented | Connection-attempt limits, per-IP active connection caps, one active socket per user, and periodic rate-state cleanup. |
| Socket event abuse | Implemented | Per-event windows cover queue, skip, stop, chat, typing, reports, live scores, final scores, and emoji changes. Payload types and lengths are validated. |
| Database failure behavior | Implemented | Only connectivity-class errors mark persistence unavailable. Invalid input and constraint errors no longer disable database use globally. Match creation fails closed instead of creating an insecure memory match. |
| Competitive integrity | Safely disabled | Ranked ELO is off unless `ENABLE_RANKED_ELO=true`. Round timing, duplicate submission prevention, and minimum live sample checks still protect unranked results. Do not enable ranked mode with browser scoring. |
| Premium authorization | Implemented | Celebrity APIs require both a valid session and `is_vip`. RevenueCat webhooks require a constant-time checked shared bearer secret and update entitlement state with replay-resistant event timestamps. |
| Moderation persistence | Implemented | Authenticated reports are persisted with match, reporter, reported user, bounded reason, and one-report-per-reporter/match uniqueness. |
| AI judge isolation | Implemented | Browsers call authenticated `/api/judge`; only the signaling server holds the AI shared secret and calls the judge service. |
| AI resource controls | Implemented | Request, encoded/decoded image, format, pixel, concurrency, timeout, response length, and per-client rate limits are enforced. Production docs and configuration details are hidden. |
| CORS/origin controls | Implemented | Exact frontend origin allowlists are used. Cookie-authenticated mutations require a trusted Origin; bearer-authenticated calls still require valid credentials. |
| Browser security headers | Implemented | Nonce CSP, HSTS, frame denial, no-sniff, no-referrer, Permissions-Policy, COOP, and disabled technology banner. The inline theme bootstrap was moved to a nonce-bearing static script. |
| API security headers | Implemented | HSTS in production, restrictive CSP, frame denial, no-sniff, no-referrer, Permissions-Policy, and explicit cross-origin resource behavior paired with CORS. |
| Database TLS | Implemented | Production certificate verification is enabled. `DB_CA_CERT` supports providers requiring a supplied CA chain. Query and statement timeouts are configured. |
| Geo privacy | Implemented | `/api/geo` no longer returns IP addresses. Edge geo headers are ignored unless `TRUST_GEO_HEADERS=true`; the vulnerable local GeoIP dependency was removed. |
| Celebrity route validation | Implemented | Strict enums and positive integer bounds, parameterized PostgreSQL queries, bounded pagination, and side-effect-free GET behavior. |
| Dependency remediation | Implemented | Next.js and Socket.IO/Express were upgraded, unused auth packages and `geoip-lite` were removed, Python packages were pinned to current releases, and `python-multipart` was removed. |
| Repository hygiene | Implemented | Root ignore rules cover secrets, generated output, logs, caches, and dependencies. Previously committed `signaling-server/node_modules` and eight runtime logs were removed. |
| Continuous checks | Implemented | GitHub security workflow builds the frontend, runs Node/Python tests, audits npm/Python dependencies, and compiles the Python service. Dependabot is configured weekly. |

## Verification results

- Frontend production build on Next.js `16.3.0`: passed, including TypeScript and all 17 routes.
- Signaling JavaScript syntax checks: passed.
- Authentication regression tests: 5 passed.
- AI image-validation tests: 3 passed.
- Python compilation and dependency consistency (`pip check`): passed.
- Frontend npm audit: **0 known vulnerabilities**.
- Signaling npm audit: **0 known vulnerabilities**.
- Python `pip-audit`: **0 known vulnerabilities**.
- Targeted tracked-file secret scan found only placeholder/example database URLs; no recognized live key or private-key pattern was found.

The full frontend ESLint suite still reports pre-existing application lint errors outside this security remediation. It is not represented as passing; the production build and TypeScript checks do pass.

## Required deployment configuration

Set these independently generated secrets and settings before deployment:

- Signaling server: `DATABASE_URL`, `NODE_ENV=production`, exact `FRONTEND_URL`, `AI_JUDGE_URL`, `AI_JUDGE_SHARED_SECRET`, and `REVENUECAT_WEBHOOK_SECRET`.
- AI judge: `ENVIRONMENT=production`, matching `AI_JUDGE_SHARED_SECRET`, `JUDGE_MODE`, `GEMINI_API_KEY` when AI mode is enabled, and a precise `FORWARDED_ALLOW_IPS` value.
- Database: provide `DB_CA_CERT` if the provider does not use a publicly trusted certificate chain.
- Proxy: set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies. Enable `TRUST_GEO_HEADERS` only when the edge overwrites the named country headers.
- Frontend: set the exact `NEXT_PUBLIC_SIGNALING_SERVER_URL` and RevenueCat public SDK configuration.
- RevenueCat: configure the webhook to call `/api/webhooks/revenuecat` with `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` and use the authenticated Emoggle UUID as the app user ID.

Keep `ENABLE_RANKED_ELO=false` until scoring is performed or attested by a trusted server-side system.

## Residual risks and operational work

These cannot be fully solved or verified from application source alone:

1. **Client-side score trust:** unranked results may still be falsified by a modified client. They no longer change ELO by default.
2. **WebRTC privacy:** media is peer-to-peer and encrypted, but peers may learn network metadata and can record what they receive. A managed TURN service with short-lived credentials is recommended.
3. **Moderation operations:** reports now persist, but a human review queue, suspension/block workflow, retention rules, and emergency escalation process still need operating procedures.
4. **Database privileges:** schema initialization still runs at application startup. Move DDL into a deployment migration job and give the runtime role only CRUD permissions.
5. **Secret history:** rotate any credential ever placed in logs, chat, Git history, or an exposed environment. A working-tree scan cannot prove historical secrecy.
6. **Infrastructure:** verify MFA, least privilege, protected branches, deploy approvals, WAF/DDoS controls, database firewalling/backups/PITR, encryption at rest, alerting, DNS registrar lock, and DNSSEC in their provider dashboards.
7. **Privacy/legal:** document AI image processing, retention, subprocessors, user consent, age controls, and regional requirements before enabling remote judge mode publicly.
8. **External assurance:** run an authenticated penetration test after redeployment, covering WebSocket abuse, session replay, entitlement events, IDOR/BOLA, resource exhaustion, and CSP behavior in the production browser.

## Deployment gate

Do not treat the existing public deployment as remediated until the new code, database columns/tables, secrets, RevenueCat webhook, and AI-service network policy are deployed and verified. After deployment, repeat non-destructive header checks and confirm that unauthenticated Socket.IO handshakes and protected API calls are rejected.
