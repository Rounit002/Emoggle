# Deployment — October 4, 2026

Frontend production project: Vercel `emoggle`, team `rounit-s-projects`, root `frontend`. The public site is https://emoggle.com and private setup is https://emoggle.com/1v1. Run Vercel CLI commands from the repository root: the nested frontend/.vercel directory links to a different project.

Backend: https://emoggle.onrender.com, Render service `srv-d8a6d799rddc739r8630`, News’s workspace. The connected repository is https://github.com/Rounit002/Emoggle.git (`emoggle` remote), branch main. The separate origin remote is unrelated.

## Backend release verified

Backend release `daa2215` added private room codes and all approved duel features; `4d3c496` patched Engine.IO to 6.6.11. Production `/health` and `/ready` pass, and `/api/capabilities` returns privateDuels and mutualEmojiSkip enabled. Startup applies the additive private schema.

The earlier `8e7b837` release failed because the Supabase certificate chain was untrusted and was rolled back by `ba7f793`. Render startup logs confirmed the error. The Supabase Root 2021 CA was downloaded from https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt and configured as DB_CA_CERT on the existing service. A verified TLS 1.3 handshake passed with certificate and hostname checks enabled. Certificate fingerprint SHA-256: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA. It expires April 26, 2031.

Authenticated production checks passed for Emoji Duel (1 round), Celebrity Face (3 rounds), and Face Sync (5 rounds): durable creation, formatted lowercase room-code lookup, guest claiming, outsider rejection and consumed-code rejection. All test rooms were cancelled after verification. These checks used the actual production database; the separate disposable PostgreSQL integration suite remains unrun.

## Frontend release

Room-code changes and the approved unified setup/support/skip changes are ready for production publication. Next.js and eslint-config-next were updated to 16.3.8 to fix the newly reported next/og RCE advisory. The production build passed with 21 routes. Production dependency audits report zero vulnerabilities in both Node services; existing development-tool advisories remain separate.

57 backend unit tests passed after the Engine.IO patch. Earlier desktop/mobile two-player checks passed code entry, readiness, mutual skip, round completion and support behavior. Real payment transactions and real-device camera/TURN checks were not performed.

No environment secrets, local verification output or the separate marketing-video project are uploaded. Local .vercel/.env.production.local contains sensitive-variable placeholders and must not be used for a local production build. Keep one signaling coordinator; future TLS changes must retain certificate verification.
