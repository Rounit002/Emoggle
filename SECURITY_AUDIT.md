# FitCheckDuel / Emoggle Security Remediation Report

**Initial audit:** 2026-08-10 (Asia/Calcutta)  
**Remediation pass:** 2026-08-10  
**Scope:** `frontend/`, `signaling-server/`, `ai-judge/`, database schemas, dependency manifests, CI, and repository hygiene

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
