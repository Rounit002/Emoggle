# Graph Report - FitCheckDuel  (2026-08-13)

## Corpus Check
- 107 files · ~351,235 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1336 nodes · 1956 edges · 98 communities (67 shown, 31 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- MediaPipe SIMD Runtime
- MediaPipe Fallback Runtime
- Celebrity Duel Experience
- Image Analysis Experience
- Frontend Dependencies
- System Architecture
- Realtime Signaling Server
- Portrait Visual Assets
- Core Face Game
- Backend Dependencies
- Live Duel Gameplay
- TypeScript Configuration
- AI Judge Service
- MediaPipe Frontend Integration
- UI Scoring Controls
- Interface Icon System
- Authentication and Access
- Socket Game Events
- Solo Face Gameplay
- Theme Management
- SIMD Filesystem Runtime
- Fallback Filesystem Runtime
- Celebrity Mimic Feature
- Legal Information Pages
- Celebrity Data API
- Local Game History
- SIMD Exception Handling
- Fallback Exception Handling
- Button Design System
- Database Schema
- Match Rating Logic
- FAQ Content
- Social Sharing Image
- About Content
- Crawler and Sitemap Policy
- Duel State Presentation
- Security Headers
- Face Landmark Technology
- Theme Toggle Controls
- SIMD GPU Bindings
- Fallback GPU Bindings
- Privacy Practices
- Purchase Policies
- SIMD Color Pipeline
- SIMD Vertex Pipeline
- Fallback Color Pipeline
- Fallback Vertex Pipeline
- AI Search Discovery
- Fashion Scorecard
- File Icon Asset
- SIMD Lifecycle
- SIMD Device Controls
- SIMD Render Attachments
- Fallback Lifecycle
- Fallback Device Controls
- Fallback Render Attachments
- Socket Client Security
- Next.js Agent Guidance
- Countdown Component
- SIMD Fullscreen Controls
- SIMD Output Runtime
- Fallback Fullscreen Controls
- Fallback Output Runtime
- Next.js Brand Asset
- Portrait Photography Asset
- SEO Strategy
- Footer Navigation
- ESLint Configuration
- PostCSS Configuration
- Globe Icon Asset
- SIMD File Sync
- SIMD Async Results
- SIMD Exit Handling
- SIMD Pointer Conversion
- SIMD Input Runtime
- SIMD Timer Runtime
- SIMD Path Resolution
- SIMD Stencil State
- SIMD Type Registration
- SIMD Filesystem Stats
- Fallback File Sync
- Fallback Async Results
- Fallback Exit Handling
- Fallback Pointer Conversion
- Fallback Input Runtime
- Fallback Timer Runtime
- Fallback Path Resolution
- Fallback Stencil State
- Fallback Type Registration
- Fallback Filesystem Stats
- Browser Window Asset
- Claude Tool Permissions
- Brand Redirects
- Vercel Logo Asset

## God Nodes (most connected - your core abstractions)
1. `cn Class Name Joiner` - 35 edges
2. `DuelArena` - 19 edges
3. `base()` - 19 edges
4. `compilerOptions` - 16 edges
5. `SoloFaceJudge` - 15 edges
6. `Site Configuration` - 14 edges
7. `scoreEmoji` - 13 edges
8. `useExpressionScorer` - 13 edges
9. `Theme Toggle` - 13 edges
10. `ExceptionInfo` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Tab-Scoped Session Resume` --semantically_similar_to--> `Anonymous Server-Side Sessions`  [INFERRED] [semantically similar]
  signaling-server/test/auth.test.js → SECURITY_AUDIT.md
- `Celebrity Faces Migration Table` --semantically_similar_to--> `Celebrity Faces Table`  [INFERRED] [semantically similar]
  signaling-server/prisma/migrations/add_celebrity_faces_table.sql → schema.sql
- `initSchema()` --semantically_similar_to--> `FitCheckDuel PostgreSQL Schema`  [INFERRED] [semantically similar]
  signaling-server/db.js → schema.sql
- `sampleCelebrities` --shares_data_with--> `Celebrity Faces Data Model`  [INFERRED]
  signaling-server/seed-celebrities.js → FEATURES.md
- `Celebrity Feature Quick Start` --calls--> `seed()`  [EXTRACTED]
  QUICK_START_CELEBRITY.md → signaling-server/seed-celebrities.js

## Import Cycles
- 2-file cycle: `frontend/app/ui/LobbyOverlay.tsx -> frontend/app/ui/index.ts -> frontend/app/ui/LobbyOverlay.tsx`

## Hyperedges (group relationships)
- **Live Duel Runtime Flow** — frontend_app_components_duelarena_matchmaking_state, frontend_app_components_duelarena_expression_scoring, frontend_app_components_videopanel_videopanel, frontend_app_components_chatbox_chatbox [EXTRACTED 1.00]
- **AI Outfit Judging Flow** — frontend_app_components_uploadjudge_handleanalyze, frontend_app_components_analyzingoverlay_analyzingoverlay, ai_judge_main_judge, ai_judge_main_judge_with_gemini, ai_judge_main_judgeresponse [INFERRED 0.85]
- **Home Mode and Provider Stack** — frontend_app_components_homeexperience_homeexperience, frontend_app_components_homeexperience_homecontent, frontend_app_context_mediapipefacecontext_mediapipefaceprovider, frontend_app_context_revenuecatcontext_revenuecatprovider, frontend_app_components_modeselect_modeselect [EXTRACTED 1.00]
- **Expression Scoring Pipeline** — frontend_app_hooks_useexpressionscorer_useexpressionscorer, frontend_app_hooks_useexpressionscorer_mediapipe_face_landmarker, frontend_app_hooks_useexpressionscorer_scoreemoji, frontend_app_hooks_useexpressionscorer_facial_expression_score [INFERRED 0.95]
- **Realtime Duel Architecture** — frontend_app_hooks_usematchmaking_usematchmaking, frontend_app_hooks_usematchmaking_socket_io_signaling_service, frontend_app_hooks_usematchmaking_peerjs_webrtc_media, frontend_app_hooks_usematchmaking_matchmakingstate [EXTRACTED 1.00]
- **Search and AI Discovery Surface** — frontend_app_layout_rootlayout, frontend_app_page_structured_product_data, frontend_app_opengraph_image_opengraphimage, frontend_app_robots_robots, frontend_app_sitemap_sitemap, llms_route_get, llms_full_route_get [INFERRED 0.95]
- **Anonymous Session Authentication Flow** — signaling_server_index_session_route, signaling_server_middleware_verifytoken_extractsessionresumetoken, signaling_server_middleware_verifytoken_findsessionuser, signaling_server_middleware_verifytoken_verifytoken, schema_sessions, schema_users [EXTRACTED 1.00]
- **Realtime Matchmaking Lifecycle** — signaling_server_index_join_queue_handler, signaling_server_index_ensureuser, signaling_server_index_enqueuesocket, signaling_server_index_startmatch, signaling_server_index_submit_score_handler, signaling_server_index_finalizematchscores, signaling_server_index_disconnect_handler [EXTRACTED 1.00]
- **Premium Celebrity Face Feature** — signaling_server_index_celebrity_routes_mount, signaling_server_index_requirevip, signaling_server_routes_celebrity_random_face_route, signaling_server_routes_celebrity_list_faces_route, signaling_server_routes_celebrity_landmarks_route, signaling_server_routes_celebrity_get_face_route, schema_celebrity_faces [INFERRED 0.95]
- **Three-Service Application Architecture** — architecture_nextjs_frontend, architecture_signaling_server, architecture_ai_judge_service, architecture_postgresql_database [EXTRACTED 1.00]
- **Celebrity Feature Delivery** — implementation_summary_celebrityduelarena, implementation_summary_celebrity_api, implementation_summary_celebrity_faces_table, signaling_server_seed_celebrities_seed [EXTRACTED 1.00]
- **Security Assurance Loop** — security_audit_continuous_security_checks, github_workflows_security_security_checks, github_dependabot_weekly_dependency_updates, signaling_server_test_auth_test_authentication_regression_suite [INFERRED 0.95]
- **Playful Expression Portrait Design** — chatgpt_image_aug_7_2026_11_29_54_pm_wink_and_tongue_expression, chatgpt_image_aug_7_2026_11_29_54_pm_close_up_face_composition, chatgpt_image_aug_7_2026_11_29_54_pm_warm_studio_portrait_style [EXTRACTED 1.00]
- **Companion Duel Portrait Design** — chatgpt_image_aug_7_2026_11_33_13_pm_wink_and_tongue_expression, chatgpt_image_aug_7_2026_11_33_13_pm_close_up_selfie_composition, chatgpt_image_aug_7_2026_11_33_13_pm_warm_yellow_studio_style, chatgpt_image_aug_7_2026_11_33_13_pm_duel_player_portrait_asset [INFERRED 0.85]
- **Pink Preview Portrait Design** — frontend_public_preview_faces_pink_wink_and_tongue_expression, frontend_public_preview_faces_pink_tight_headshot_composition, frontend_public_preview_faces_pink_warm_yellow_backdrop, frontend_public_preview_faces_pink_player_b_preview_asset [INFERRED 0.95]
- **Violet Preview Portrait Design** — frontend_public_preview_faces_violet_puckered_lips_expression, frontend_public_preview_faces_violet_waist_up_environmental_portrait, frontend_public_preview_faces_violet_embroidered_dark_top, frontend_public_preview_faces_violet_restaurant_interior_backdrop [EXTRACTED 1.00]
- **Playful Restaurant Portrait Design** — indiangg_puckered_lips_expression, indiangg_seated_environmental_portrait, indiangg_embroidered_dark_top, indiangg_restaurant_interior_backdrop [EXTRACTED 1.00]

## Communities (98 total, 31 thin omitted)

### Community 0 - "MediaPipe SIMD Runtime"
Cohesion: 0.01
Nodes (18): EmscriptenEH, EmscriptenSjLj, RFC-2279, RFC-3629, NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),, NOTE: This is also used as the process return code in shell environments, TODO: check for O_SEARCH? (== search for dir only), NOTE: None of the defaults here are true. We're just returning safe and (+10 more)

### Community 1 - "MediaPipe Fallback Runtime"
Cohesion: 0.01
Nodes (18): EmscriptenEH, EmscriptenSjLj, RFC-2279, RFC-3629, NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),, NOTE: This is also used as the process return code in shell environments, TODO: check for O_SEARCH? (== search for dir only), NOTE: None of the defaults here are true. We're just returning safe and (+10 more)

### Community 2 - "Celebrity Duel Experience"
Cohesion: 0.06
Nodes (46): CelebrityDuelArena, CelebrityDuelArenaProps, BlinkingEmoji, BlinkingEmojiProps, ExtraAttrs, FloatingEmoji, FloatingEmojiProps, RevealTag (+38 more)

### Community 3 - "Image Analysis Experience"
Cohesion: 0.09
Nodes (48): AnalyzingOverlay, CornerBrackets, LABELS, LandmarkDot, LANDMARKS, THOUGHTS, handleAnalyze, JudgeResult (+40 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, framer-motion, dependencies, framer-motion, lenis, @mediapipe/tasks-vision, next (+38 more)

### Community 5 - "System Architecture"
Cohesion: 0.07
Nodes (40): Pinned AI Judge Dependencies, Python 3.11.9 Runtime, FastAPI AI Judge Service, ELO Rating System, Expression Scoring Algorithm, FitCheckDuel System Architecture, Legacy Local and OAuth Authentication Model, Next.js Frontend (+32 more)

### Community 6 - "Realtime Signaling Server"
Cohesion: 0.06
Nodes (31): activeMatches, activeSocketByUser, activeSocketsByIp, allowedOrigins, apiLimiter, app, calculateEloShift(), CHAT_BANNED_WORDS (+23 more)

### Community 7 - "Portrait Visual Assets"
Cohesion: 0.07
Nodes (32): Close-Up Face Composition, Emoji Mimic Visual, Playful Winking Portrait, Warm Studio Portrait Style, Wink and Tongue-Out Expression, Close-Up Selfie Composition, Duel Player Portrait Asset, Emoji Mimic Visual (+24 more)

### Community 8 - "Core Face Game"
Cohesion: 0.10
Nodes (29): Browser Face-Landmark Scoring, Emoggle Browser Face-Matching Game, Peer-to-Peer Live Video, BANNED_WORDS, censor, ChatBox, ChatBoxProps, MessageBubble (+21 more)

### Community 9 - "Backend Dependencies"
Cohesion: 0.07
Nodes (29): cookie-parser, cors, dotenv, express, express-rate-limit, nodemon, pg, dependencies (+21 more)

### Community 10 - "Live Duel Gameplay"
Cohesion: 0.11
Nodes (23): AppPhase, DEFAULT_RANK, DuelArena, DuelArenaProps, DuelColumn, DuelColumnProps, Duel Expression Scoring, finiteOr() (+15 more)

### Community 11 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 12 - "AI Judge Service"
Cohesion: 0.13
Nodes (22): AI Judge Service, clean_json(), decode_image(), Gemini Fashion Critic Prompt, get_gemini_model(), health(), judge(), judge_fallback() (+14 more)

### Community 13 - "MediaPipe Frontend Integration"
Cohesion: 0.07
Nodes (25): Generated MediaPipe Asset Ignores, Next.js Frontend Stack, Tailwind PostCSS Pipeline, hardware_concurrency(), Modularized MediaPipe Vision WebAssembly Runtime, MediaPipe Vision UMD Module Factory, RFC-2279, RFC-3629 (+17 more)

### Community 14 - "UI Scoring Controls"
Cohesion: 0.11
Nodes (19): Facial Expression Score, ButtonProps, Size, sizes, Variant, variants, cn Class Name Joiner, Emoggle Logo (+11 more)

### Community 15 - "Interface Icon System"
Cohesion: 0.24
Nodes (20): ArrowLeft(), ArrowRight(), base(), Camera(), Check(), Crown(), Globe(), History() (+12 more)

### Community 16 - "Authentication and Access"
Cohesion: 0.20
Nodes (19): Private AI Judge Proxy, Protected Celebrity Routes Mount, requireVIP(), Anonymous Session Bootstrap Route, crypto, Extract Bearer Token, Extract Request Token, Extract Tab Session Resume Token (+11 more)

### Community 17 - "Socket Game Events"
Cohesion: 0.18
Nodes (18): Change Emoji Handler, Chat Message Relay Handler, clampScore(), clearMatchState(), Socket Disconnect Handler, enqueueSocket(), getMatchBySocket(), Live Score Handler (+10 more)

### Community 18 - "Solo Face Gameplay"
Cohesion: 0.17
Nodes (16): EMOJI_PROMPTS, EmojiCard(), Solo Expression Scoring, formatScore(), HistoryChip(), HistoryEntry, loadHistory(), Local Solo Score History (+8 more)

### Community 19 - "Theme Management"
Cohesion: 0.15
Nodes (15): applyToDom, getSystemMode(), readStored(), ThemeContext, ThemeContextValue, ThemeMode, ThemeProvider, ThemeSource (+7 more)

### Community 20 - "SIMD Filesystem Runtime"
Cohesion: 0.12
Nodes (16): abort(), assert(), assignWasmExports(), createLazyFile(), createWasm(), findWasmBinary(), forceLoadFile(), getBinarySync() (+8 more)

### Community 21 - "Fallback Filesystem Runtime"
Cohesion: 0.12
Nodes (16): abort(), assert(), assignWasmExports(), createLazyFile(), createWasm(), findWasmBinary(), forceLoadFile(), getBinarySync() (+8 more)

### Community 22 - "Celebrity Mimic Feature"
Cohesion: 0.17
Nodes (15): Celebrity Face API, Celebrity Face Mimic, Celebrity Landmark Scoring, Celebrity Face Mimic Plan, Celebrity Faces Data Model, Celebrity Landmark Comparison, Implemented Celebrity API, Celebrity Face Mimic Implementation (+7 more)

### Community 23 - "Legal Information Pages"
Cohesion: 0.13
Nodes (7): ContactPage, metadata, metadata, metadata, metadata, nextConfig, .next

### Community 24 - "Celebrity Data API"
Cohesion: 0.15
Nodes (14): Celebrity Faces Table, Celebrity Faces Migration Table, Sample Celebrity Face Seed Data, CATEGORIES, DIFFICULTIES, express, Get Celebrity Face Route, Celebrity Face Landmarks Route (+6 more)

### Community 25 - "Local Game History"
Cohesion: 0.23
Nodes (13): Duel History Entry, duelsToRows(), DuelTable(), formatWhen(), History Page, isDuel(), isSolo(), Solo History Entry (+5 more)

### Community 28 - "Button Design System"
Cohesion: 0.20
Nodes (9): Button, Sticker Button Pattern, Icon Button, IconButtonProps, sizes, variants, Lobby Overlay, LobbyOverlayProps (+1 more)

### Community 29 - "Database Schema"
Cohesion: 0.38
Nodes (9): Matches Table, Moderation Reports Table, FitCheckDuel PostgreSQL Schema, Sessions Table, Users Table, initSchema(), { Pool }, path (+1 more)

### Community 30 - "Match Rating Logic"
Cohesion: 0.20
Nodes (11): calculateMatchElo(), countryLabelFromCode(), ensureUser(), finalizeMatchScores(), isDatabaseConnectivityError(), isoFlag(), Join Queue Handler, mapUserRow() (+3 more)

### Community 31 - "FAQ Content"
Cohesion: 0.31
Nodes (3): FAQ Page, metadata, Frequently Asked Questions

### Community 32 - "Social Sharing Image"
Cohesion: 0.22
Nodes (7): Emoggle, alt, contentType, Open Graph Image, size, routes, Sitemap

### Community 33 - "About Content"
Cohesion: 0.36
Nodes (4): AboutPage, metadata, InfoPageShell, metadata

### Community 34 - "Crawler and Sitemap Policy"
Cohesion: 0.43
Nodes (6): Site Configuration, AI Crawler Access, Robots Policy, Full LLM Product Facts Route, AI Crawler Product Manifest, LLM Discovery Route

### Community 35 - "Duel State Presentation"
Cohesion: 0.38
Nodes (6): Playing Content, Reveal Content, Seam, SeamProps, SeamState, useCountdown

### Community 36 - "Security Headers"
Cohesion: 0.33
Nodes (6): Frontend Security Headers, config, Nonce-Based Content Security Policy, originFor(), proxy(), RevenueCat Entitlement Webhook

### Community 37 - "Face Landmark Technology"
Cohesion: 0.40
Nodes (6): MediaPipe Face Landmarker, In-Browser Expression Scoring, Live Multiplayer Mode, Solo Emoji Scan, Home Page, Structured Product Data

### Community 38 - "Theme Toggle Controls"
Cohesion: 0.47
Nodes (5): Moon Icon, Sun Icon, Theme Toggle, ThemeToggleProps, Pre-Hydration Theme Initializer

### Community 39 - "SIMD GPU Bindings"
Cohesion: 0.33
Nodes (6): makeBufferEntry(), makeEntries(), makeEntry(), makeSamplerEntry(), makeStorageTextureEntry(), makeTextureEntry()

### Community 40 - "Fallback GPU Bindings"
Cohesion: 0.33
Nodes (6): makeBufferEntry(), makeEntries(), makeEntry(), makeSamplerEntry(), makeStorageTextureEntry(), makeTextureEntry()

### Community 41 - "Privacy Practices"
Cohesion: 0.40
Nodes (5): Device-Local Game History, Data Minimization, Limited Data Sharing, Local Browser Data Control, Privacy Policy

### Community 42 - "Purchase Policies"
Cohesion: 0.40
Nodes (5): Digital Purchase Refund Rule, Refund Policy, Acceptable Use, Age Eligibility, Terms and Conditions

### Community 43 - "SIMD Color Pipeline"
Cohesion: 0.40
Nodes (5): makeBlendComponent(), makeBlendState(), makeColorState(), makeColorStates(), makeFragmentState()

### Community 44 - "SIMD Vertex Pipeline"
Cohesion: 0.40
Nodes (5): makeVertexAttribute(), makeVertexAttributes(), makeVertexBuffer(), makeVertexBuffers(), makeVertexState()

### Community 45 - "Fallback Color Pipeline"
Cohesion: 0.40
Nodes (5): makeBlendComponent(), makeBlendState(), makeColorState(), makeColorStates(), makeFragmentState()

### Community 46 - "Fallback Vertex Pipeline"
Cohesion: 0.40
Nodes (5): makeVertexAttribute(), makeVertexAttributes(), makeVertexBuffer(), makeVertexBuffers(), makeVertexState()

### Community 47 - "AI Search Discovery"
Cohesion: 0.40
Nodes (5): AI Search Visibility, llms.txt Product Map, llms.txt Proposal, Search Visibility Measurement Plan, OpenAI Publisher Guidance

### Community 48 - "Fashion Scorecard"
Cohesion: 0.50
Nodes (3): OutfitItem, ScoreCard, ScoreCardProps

### Community 49 - "File Icon Asset"
Cohesion: 0.50
Nodes (4): Document File Icon, Document Text Lines, Folded Page Outline, Generic File Affordance

### Community 50 - "SIMD Lifecycle"
Cohesion: 0.50
Nodes (4): initRuntime(), postRun(), preRun(), run()

### Community 51 - "SIMD Device Controls"
Cohesion: 0.50
Nodes (4): ioctl_tcgets(), ioctl_tcsets(), ioctl_tiocgwinsz(), ___syscall_ioctl()

### Community 52 - "SIMD Render Attachments"
Cohesion: 0.50
Nodes (4): makeColorAttachment(), makeColorAttachments(), makeDepthStencilAttachment(), makeRenderPassDescriptor()

### Community 53 - "Fallback Lifecycle"
Cohesion: 0.50
Nodes (4): initRuntime(), postRun(), preRun(), run()

### Community 54 - "Fallback Device Controls"
Cohesion: 0.50
Nodes (4): ioctl_tcgets(), ioctl_tcsets(), ioctl_tiocgwinsz(), ___syscall_ioctl()

### Community 55 - "Fallback Render Attachments"
Cohesion: 0.50
Nodes (4): makeColorAttachment(), makeColorAttachments(), makeDepthStencilAttachment(), makeRenderPassDescriptor()

### Community 56 - "Socket Client Security"
Cohesion: 0.50
Nodes (4): cleanIp(), Socket Connection Handler, socketClientIp(), Express Socket.IO PostgreSQL Backend Stack

### Community 57 - "Next.js Agent Guidance"
Cohesion: 0.67
Nodes (3): Next.js Version-Specific Agent Rules, Frontend Agent Instructions Reference, Next.js Frontend Project

### Community 59 - "SIMD Fullscreen Controls"
Cohesion: 0.67
Nodes (3): getFullscreenElement(), requestFullscreen(), updateCanvasDimensions()

### Community 60 - "SIMD Output Runtime"
Cohesion: 0.67
Nodes (3): msync(), put_char(), write()

### Community 61 - "Fallback Fullscreen Controls"
Cohesion: 0.67
Nodes (3): getFullscreenElement(), requestFullscreen(), updateCanvasDimensions()

### Community 62 - "Fallback Output Runtime"
Cohesion: 0.67
Nodes (3): msync(), put_char(), write()

### Community 63 - "Next.js Brand Asset"
Cohesion: 1.00
Nodes (3): Monochrome Framework Branding, Next.js Framework Identity, Next.js Wordmark

### Community 64 - "Portrait Photography Asset"
Cohesion: 0.67
Nodes (3): Skeptical Side-Eye Expression, Skeptical Woman Portrait, Studio Portrait Photography

### Community 65 - "SEO Strategy"
Cohesion: 0.67
Nodes (3): Google Search Guidance, Structured Product Data, Technical SEO

## Knowledge Gaps
- **290 isolated node(s):** `metadata`, `LANDMARKS`, `LABELS`, `THOUGHTS`, `CelebrityDuelArenaProps` (+285 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `JudgeResponse` connect `AI Judge Service` to `Image Analysis Experience`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `JudgeResult` connect `Image Analysis Experience` to `AI Judge Service`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `dotenv` connect `Backend Dependencies` to `AI Judge Service`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `metadata`, `LANDMARKS`, `LABELS` to the rest of the system?**
  _290 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MediaPipe SIMD Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.009950248756218905 - nodes in this community are weakly interconnected._
- **Should `MediaPipe Fallback Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.009950248756218905 - nodes in this community are weakly interconnected._
- **Should `Celebrity Duel Experience` be split into smaller, more focused modules?**
  _Cohesion score 0.06127946127946128 - nodes in this community are weakly interconnected._