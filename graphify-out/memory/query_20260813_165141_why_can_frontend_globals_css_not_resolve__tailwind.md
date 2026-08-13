---
type: "query"
date: "2026-08-13T16:51:41.540743+00:00"
question: "Why can frontend globals.css not resolve @tailwindcss/postcss, and which configuration and package files define that dependency?"
contributor: "graphify"
source_nodes: ["postcss.config.mjs", "frontend/package.json", "tailwindcss"]
---

# Q: Why can frontend globals.css not resolve @tailwindcss/postcss, and which configuration and package files define that dependency?

## Answer

The audit's pnpm command moved npm-installed dependencies into frontend/node_modules/.ignored. The @tailwindcss/postcss directory was restored, but the running Turbopack process retained the missing-module failure in .next-build/dev. Restoring module resolution and clearing only that generated dev cache fixed the issue. Direct PostCSS processing now succeeds and the existing Next dev server returns HTTP 200 for the homepage.

## Source Nodes

- postcss.config.mjs
- frontend/package.json
- tailwindcss