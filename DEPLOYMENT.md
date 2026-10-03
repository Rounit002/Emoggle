# Deployment status — October 4, 2026

- Frontend: Vercel project `emoggle`, team `rounit-s-projects`, repository root directory `frontend`. Run CLI deployment commands from the repository root; `frontend/.vercel` links to a different project.
- Backend: `https://emoggle.onrender.com`. The example `api.emoggle.com` is not the production API.
- Production site: `https://emoggle.com`. Vercel reports valid configuration for the apex and www domains.
- Git deployment repository: `https://github.com/Rounit002/Emoggle.git`, remote `emoggle`, branch `main`. The separate `origin` remote is unrelated to this release.

## Release in progress

Backend commit `8e7b837` was pushed first, preserving compatibility with the existing frontend. Before publishing the new frontend, verify that Render has deployed this commit, `/ready` returns JSON with `status: ready`, and `/api/capabilities` returns `privateDuels: true` and `mutualEmojiSkip: true`.

Vercel preview build **passed** (21 routes): https://emoggle-3son9dps8-rounit-s-projects.vercel.app/1v1. The deployed slider and all three game selections were checked in Chrome. Invitation creation correctly remains disabled while the old backend lacks the capabilities endpoint. The preview uses existing Vercel environment settings; its origin must be explicitly allowed by the backend for integrated preview play.

All **57 backend unit tests passed** before publishing the backend commit. Real disposable PostgreSQL integration tests and staging payment transactions remain unperformed; existing production database readiness does not prove the new migration has succeeded.

The currently signed-in Render account contains only an unrelated `surviver` service. Access to the account/workspace owning Emoggle is needed if Git auto-deployment does not complete or if database TLS/migration errors require diagnosis. Do not deploy changes to `surviver`.

## Completion checks

1. Inspect Render's successful commit/build and startup logs. Startup runs the additive database migration. Production certificate verification stays enabled; configure the provider's CA through `DB_CA_CERT` if required. Keep one signaling coordinator.
2. Verify readiness and capabilities before releasing the frontend. Do not publish an enabled private-duel UI against an older or persistence-unavailable backend.
3. Deploy from the repository root with `vercel deploy --prod --yes`, using the existing production environment settings. Do not use `.vercel/.env.production.local` for a local build: sensitive variables are placeholders in the downloaded file.
4. Verify the apex homepage, no arrival popups, `/1v1` slider/game choices, production API origins and authenticated invitation creation. Check two-player readiness, skip consent, one completed round and support timing with real devices when available.
5. Update this file and the implementation report with the final frontend deployment URL and backend release status.

No environment secrets, verification artifacts or the separate marketing-video project are included in the frontend upload.
