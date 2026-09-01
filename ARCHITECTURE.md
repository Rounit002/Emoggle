# Emoggle - System Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Real-Time Communication](#real-time-communication)
9. [Security & Authentication](#security--authentication)
10. [Deployment Architecture](#deployment-architecture)
11. [Performance Considerations](#performance-considerations)
12. [Key Algorithms](#key-algorithms)
13. [Development Workflow](#development-workflow)
14. [Troubleshooting Guide](#troubleshooting-guide)

---

## System Overview

**Emoggle** (formerly FitCheckDuel) is a real-time competitive facial expression matching platform where users compete in live face duels through WebRTC video connections. The application features multiple game modes including live emoji duels, solo practice, celebrity face mimicry, and AI-powered fashion judging.

### Key Capabilities
- **Real-time P2P video communication** via WebRTC/PeerJS
- **Facial landmark detection** using MediaPipe Face Mesh
- **Expression scoring algorithm** comparing user expressions to target emojis
- **ELO-based matchmaking** with ranking system
- **Gender-filtered matchmaking** (VIP feature)
- **AI-powered fashion judging** using Google Gemini Vision API
- **Celebrity face mimicry mode** (in development)
- **Session-based authentication** with Google OAuth support
- **Multi-region deployment** with geolocation support

### Game Modes
1. **Live Face Duel** - Match expressions with a random opponent in real-time
2. **Solo Practice** - Practice emoji expressions without opponents
3. **Fashion Judge** - Upload outfit photos for AI critique
4. **Celebrity Mimic** - Mimic celebrity facial expressions (upcoming)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer (Browser)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js 16.3.0 Frontend (React 19 + TypeScript)        │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Pages (App Router)                                 │ │   │
│  │  │ - Home, About, Contact, FAQ, Profile, Privacy     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Core Components                                    │ │   │
│  │  │ - DuelArena, VideoPanel, ScoreCard               │ │   │
│  │  │ - SoloFaceJudge, UploadJudge, CelebrityDuelArena │ │   │
│  │  │ - AnalyzingOverlay, Countdown, ChatBox           │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Context Providers                                  │ │   │
│  │  │ - MediaPipeFaceContext, UserProfileContext        │ │   │
│  │  │ - PlayerNameContext, CountryContext, ThemeContext │ │   │
│  │  │ - RevenueCatContext (payment integration)         │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Custom Hooks                                       │ │   │
│  │  │ - useExpressionScorer (face scoring algorithm)    │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │ HTTP/WS         │ WebRTC P2P      │ HTTP              │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 │                 ▼
┌─────────────────────┐     │      ┌─────────────────────┐
│  Signaling Server   │     │      │   AI Judge Service  │
│  (Node.js/Express)  │     │      │   (Python/FastAPI)  │
│  Port: 3001         │     │      │   Port: 8000        │
│  ┌───────────────┐  │     │      │  ┌───────────────┐  │
│  │ Socket.io Hub │  │     │      │  │ Gemini Vision │  │
│  │ - Matchmaking │  │     │      │  │ Fashion Judge │  │
│  │ - Queue Mgmt  │  │     │      │  │ - AI Mode     │  │
│  │ - ELO Calc    │  │     │      │  │ - Random Mode │  │
│  │ - Auth Routes │  │     │      │  └───────────────┘  │
│  │ - User API    │  │     │      │  ┌───────────────┐  │
│  │ - Celebrity   │  │     │      │  │ Endpoints:    │  │
│  │   Features    │  │     │      │  │ - /health     │  │
│  └───────────────┘  │     │      │  │ - /judge      │  │
│                     │     │      │  └───────────────┘  │
└──────────┬──────────┘     │      └─────────────────────┘
           │                │
           ▼                │
┌─────────────────────────────────┐
│     PostgreSQL Database         │
│  ┌──────────────────────────┐   │
│  │ Tables:                  │   │
│  │ - users                  │   │
│  │ - sessions               │   │
│  │ - matches                │   │
│  │ - celebrity_faces        │   │
│  │ - moderation_reports     │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘

        WebRTC P2P Connection (via PeerJS)
┌──────────┐                 ┌──────────┐
│ Client A │◄───────────────►│ Client B │
│ (Browser)│    Direct Video │ (Browser)│
└──────────┘    + Audio      └──────────┘
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.3.0 | React framework with App Router |
| **React** | 19.2.4 | UI component library |
| **TypeScript** | ^5 | Type-safe JavaScript |
| **Tailwind CSS** | ^4 | Utility-first styling |
| **Framer Motion** | 12.40.0 | Animation library |
| **Socket.io Client** | 4.8.3 | WebSocket client for real-time communication |
| **PeerJS** | 1.5.5 | WebRTC wrapper for P2P video |
| **MediaPipe Tasks Vision** | 0.10.35 | Face detection & landmark tracking |
| **react-webcam** | 7.2.0 | Webcam access component |
| **html-to-image** | 1.11.13 | Screenshot generation for sharing |
| **Lenis** | 1.3.25 | Smooth scroll library |
| **RevenueCat Purchases JS** | 1.47.3 | Payment & subscription management |

### Backend (Signaling Server)
| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | >=18 | Runtime environment |
| **Express** | 4.22.2 | HTTP server framework |
| **Socket.io** | 4.8.3 | WebSocket server for matchmaking |
| **pg** | 8.21.0 | PostgreSQL client (raw SQL) |
| **dotenv** | 17.4.2 | Environment variable management |
| **cors** | 2.8.5 | Cross-origin resource sharing |
| **cookie-parser** | 1.4.7 | Cookie parsing middleware |
| **express-rate-limit** | 7.5.0 | API rate limiting |
| **nodemon** | 3.0.2 | Development server with auto-reload |

### AI Judge Service
| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.x | Runtime |
| **FastAPI** | 0.141.1 | Modern async web framework |
| **Uvicorn** | 0.52.1 | ASGI server |
| **Pydantic** | 2.13.4 | Data validation |
| **google-generativeai** | 0.8.6 | Google Gemini API SDK |
| **python-dotenv** | 1.2.2 | Environment variable management |
| **Pillow** | 12.3.0 | Image processing |

---

## Core Components

### 1. Frontend Structure

#### Pages (Next.js App Router)
```
app/
├── page.tsx                 # Home/Landing page with mode selection
├── about/page.tsx          # About page
├── contact/page.tsx        # Contact form
├── faq/page.tsx            # Frequently asked questions
├── privacy/page.tsx        # Privacy policy
├── terms/page.tsx          # Terms of service
├── refund/page.tsx         # Refund policy
├── how-it-works/page.tsx   # Tutorial page
├── history/page.tsx        # Match history (future)
└── verify-scorecard/       # Scorecard verification
```

#### Core Components
```
app/components/
├── AnalyzingOverlay.tsx      # AI fashion analysis loading animation
├── CelebrityDuelArena.tsx    # Celebrity mimicry game arena
├── ChatBox.tsx               # In-game real-time chat
├── ChooseGameMode.tsx        # Game mode picker modal
├── Countdown.tsx             # Pre-match countdown (3-2-1)
├── DuelArena.tsx             # Main 1v1 live face duel arena
├── Footer.tsx                # Site-wide footer navigation
├── HomeExperience.tsx        # Landing page main section
├── InfoPageShell.tsx         # Reusable info page layout
├── ModeSelect.tsx            # Game mode selection screen
├── NameEntryModal.tsx        # Username entry modal
├── ScoreCard.tsx             # Post-match results display
├── SmoothScroll.tsx          # Lenis smooth scroll wrapper
├── SoloFaceJudge.tsx         # Solo practice mode
├── UploadJudge.tsx           # Fashion photo upload & AI judge
├── VideoPanel.tsx            # WebRTC video display panel
│
├── home/
│   ├── EmojiMotion.tsx       # Animated emoji display
│   └── HeadlineMotion.tsx    # Animated headline text
│
└── result/
    ├── analytics.ts          # Match analytics utilities
    ├── index.ts              # Result exports
    ├── ResultScreen.tsx      # Main result screen component
    ├── SarcasticMessageGenerator.ts  # Funny result messages
    ├── ShareButton.tsx       # Social share button
    ├── ShareScoreCard.tsx    # Scorecard image generator
    ├── ShareScoreCardPortal.tsx  # Portal for rendering scorecard
    └── useShareScorecard.ts  # Hook for sharing logic
```

#### Context Providers
```
app/context/
├── CountryContext.tsx          # User geolocation state
├── MediaPipeFaceContext.tsx    # MediaPipe initialization & face detection
├── PlayerNameContext.tsx       # Player username management
├── RevenueCatContext.tsx       # Payment & subscription state
├── ThemeContext.tsx            # Light/dark theme toggle
└── UserProfileContext.tsx      # User profile & ELO management
```

#### Custom Hooks
```
app/hooks/
└── useExpressionScorer.ts      # Face landmark scoring algorithm
```

#### Utilities
```
app/lib/
├── emojis.ts                   # Emoji list for random selection
├── socket.ts                   # Socket.io client singleton
└── utils.ts                    # Helper functions
```

---

### 2. Signaling Server Components

#### Main Entry Point
- **`index.js`** - Express + Socket.io server
  - CORS configuration for frontend origins
  - WebSocket event handlers
  - Matchmaking queue management
  - Active match state tracking
  - ELO calculation system
  - Celebrity feature routes

#### Database Layer
- **`db.js`** - PostgreSQL connection pool
  - Raw SQL queries using `pg` library
  - Connection pooling (max 20 connections)
  - Fallback to in-memory mode if database unavailable
  - Schema initialization utilities

#### Routing
```
routes/
└── (Future expansion for modular routing)
```

#### Key In-Memory State
```javascript
const waitingQueue = [];              // Matchmaking queue [{socketId, peerId, ...}]
const socketMeta = new Map();         // Socket metadata (userId, peerId, elo, gender, etc.)
const activeMatches = new Map();      // Active match state {matchId: {...}}
const memoryVipUsers = new Set();     // VIP user cache for quick lookups
```

---

### 3. AI Judge Service

#### Entry Point
- **`main.py`** - FastAPI application
  - `/health` - Health check endpoint
  - `/judge` - Fashion critique endpoint (accepts base64 image)

#### Operational Modes

**1. Random Mode** (`JUDGE_MODE=random`)
- Fallback mode without API key
- Generates random scores (1.0-10.0)
- Generic feedback messages
- 3-6 second simulated processing delay
- Perfect for development/testing

**2. AI Mode** (`JUDGE_MODE=ai`)
- Requires `GEMINI_API_KEY`
- Uses Google Gemini Vision API (gemini-1.5-flash)
- Real outfit analysis from webcam/photo
- Item-by-item critique (shirt, pants, shoes, accessories)
- Returns: score, verdict (Drip/Drown), roast message, detailed items

---

## Data Flow

### 1. User Onboarding Flow

```
┌──────────┐
│  Client  │
└─────┬────┘
      │ 1. First visit (no userId in localStorage)
      ├──► Display NameEntryModal
      │
      │ 2. Submit: { username, age, verified_gender }
      ├──► POST /api/users/onboard
      │
      ▼
┌─────────────────┐
│ Signaling Server│
└────────┬────────┘
         │ 3. INSERT INTO users (id, username, age, verified_gender, elo=1000)
         ├──► PostgreSQL
         │
         │ 4. Return { id: UUID, username, elo, isVIP, freeGenderMatchesLeft }
         ├──► Client stores userId in localStorage
         │
         ▼
      User profile created, can join matchmaking
```

---

### 2. Matchmaking Flow

```
Client A                    Signaling Server                    Client B
   │                               │                               │
   │ 1. Connect Socket.io          │                               │
   ├──────────────────────────────►│                               │
   │   socket.connect()            │◄──────────────────────────────┤
   │                               │ socket.connect()              │
   │                               │                               │
   │ 2. emit('join_queue')         │                               │
   ├──────────────────────────────►│                               │
   │   {                           │◄──────────────────────────────┤
   │     peerId,                   │ emit('join_queue')            │
   │     country,                  │   { peerId, country, ... }    │
   │     username,                 │                               │
   │     gender,                   │                               │
   │     seeking,  // 'Any', 'Male', 'Female'                     │
   │     profile: { elo, ... },    │                               │
   │     userId                    │                               │
   │   }                           │                               │
   │                               │                               │
   │◄──────────────────────────────┤                               │
   │ emit('waiting')               │──────────────────────────────►│
   │                               │    emit('waiting')            │
   │                               │                               │
   │                               │ 3. Match found!               │
   │                               │   - Check gender preferences  │
   │                               │   - Check ELO proximity       │
   │                               │   - Remove from queue         │
   │                               │   - Create match in database  │
   │                               │   - Generate matchId          │
   │                               │                               │
   │◄──────────────────────────────┤                               │
   │ emit('match_started')         │──────────────────────────────►│
   │   {                           │    emit('match_started')      │
   │     matchId,                  │      { matchId, ... }         │
   │     partnerPeerId,            │                               │
   │     partnerUsername,          │                               │
   │     emoji,                    │                               │
   │     duration: 10000           │                               │
   │   }                           │                               │
   │                               │                               │
   │◄──────────────────────────────┼──────────────────────────────►│
   │         4. WebRTC P2P Connection Established (via PeerJS)     │
   │            - Video stream exchange                            │
   │            - Audio stream exchange                            │
   │                                                               │
```

---

### 3. Live Face Duel Flow

```
┌───────────────────────────────────────────────────┐
│ 1. Match Started                                  │
│    - Both clients receive 'match_started' event   │
│    - matchId, partnerPeerId, emoji assigned       │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 2. 3-Second Countdown (server-controlled)         │
│    - Server emits 'countdown_tick': 3, 2, 1       │
│    - Countdown component displays timer           │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 3. Emoji Revealed                                 │
│    - Both clients display the target emoji        │
│    - Example: 😂 (laughing face)                  │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 4. 10-Second Scan Phase (client-controlled)       │
│                                                   │
│    Every frame (60 FPS):                          │
│    a) MediaPipe detects face landmarks (478 pts)  │
│    b) useExpressionScorer calculates score (0-10) │
│       - Mouth width/height ratio                  │
│       - Eye openness (aspect ratio)               │
│       - Eyebrow raise distance                    │
│    c) Track peak score in state                   │
│    d) Display real-time score on UI               │
│                                                   │
│    Optional: Emit score updates via Socket.io     │
│    - socket.emit('score_update', { score })       │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 5. Submit Scores                                  │
│    - Client A: emit('submit_score', { matchId,    │
│                  score: 8.5 })                    │
│    - Client B: emit('submit_score', { matchId,    │
│                  score: 7.2 })                    │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 6. Server Finalizes Match                         │
│    - Determine winner (higher score wins)         │
│    - Calculate ELO changes (K-factor: 32)         │
│    - Update database:                             │
│      UPDATE matches SET                           │
│        player1_score = 8.5,                       │
│        player2_score = 7.2,                       │
│        winner_id = player1_id,                    │
│        status = 'COMPLETED',                      │
│        completed_at = NOW()                       │
│      UPDATE users SET                             │
│        elo = new_elo                              │
│        WHERE id IN (player1_id, player2_id)       │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ 7. Results Broadcast                              │
│    - emit('match_result') to both clients         │
│    - Payload: {                                   │
│        winner: 'player1',                         │
│        player1: { score, elo, eloChange },        │
│        player2: { score, elo, eloChange }         │
│      }                                            │
│    - Display ResultScreen with ScoreCard          │
│    - Show ELO changes (+15 / -15)                 │
│    - Generate shareable scorecard image           │
└───────────────────────────────────────────────────┘
```

---

### 4. Fashion Judge Flow

```
┌──────────┐
│  Client  │
└─────┬────┘
      │ 1. User uploads photo or uses webcam
      ├──► Capture image (react-webcam or file input)
      │
      │ 2. Convert to base64
      ├──► const base64 = canvas.toDataURL('image/jpeg', 0.8)
      │
      │ 3. POST /judge
      ├──────────────────────────►
      │   { image: "data:image/jpeg;base64,..." }
      │
      ▼
┌─────────────────┐
│   AI Judge      │
│   (FastAPI)     │
└────────┬────────┘
         │ 4. Mode: random or ai
         │
         ├─ If JUDGE_MODE=random:
         │  - Generate random score (1.0-10.0)
         │  - Random verdict ("Drip" or "Drown")
         │  - Generic roast message
         │  - Sleep 3-6 seconds (simulate processing)
         │
         ├─ If JUDGE_MODE=ai:
         │  - Decode base64 image
         │  - Send to Gemini Vision API
         │  - Prompt: "Rate this outfit from 1-10..."
         │  - Parse response JSON
         │  - Extract score, verdict, roast, items
         │
         │ 5. Return response
         ├──────────────────────────►
         │   {
         │     score: 7.5,
         │     verdict: "Drip",
         │     roast: "Clean lines, confident energy.",
         │     items: [
         │       { name: "shirt", status: "Drip", reason: "..." },
         │       { name: "pants", status: "Drown", reason: "..." }
         │     ]
         │   }
         │
         ▼
      Display results with animations
```

---

## Database Schema

### Tables

#### 1. users
Stores user profiles, authentication, and game statistics.

```sql
CREATE TABLE users (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  socket_id         VARCHAR       UNIQUE,
  username          VARCHAR       DEFAULT 'anonymous',
  age               INT,
  verified_gender   VARCHAR,       -- 'Male', 'Female', 'Other'
  elo               INT           DEFAULT 1000,
  is_vip            BOOLEAN       DEFAULT false,
  free_matches_left INT           DEFAULT 5,
  created_at        TIMESTAMP     DEFAULT NOW(),

  -- Auth fields
  email             VARCHAR       UNIQUE,
  password_hash     VARCHAR,       -- bcrypt hash
  auth_provider     VARCHAR       DEFAULT 'local',  -- 'local', 'google'
  google_id         VARCHAR       UNIQUE,
  login_count       INT           DEFAULT 0,
  last_login_at     TIMESTAMP,
  vip_expires_at    TIMESTAMPTZ,
  revenuecat_event_at TIMESTAMPTZ
);
```

**Key Fields:**
- `elo`: Rating for matchmaking (starts at 1000)
- `is_vip`: VIP status (enables gender filtering)
- `free_matches_left`: Free gender-filtered matches for non-VIP users
- `auth_provider`: 'local' (email/password) or 'google' (OAuth)

---

#### 2. sessions
Session tokens for authentication (JWT alternative with database storage).

```sql
CREATE TABLE sessions (
  token       VARCHAR(64) PRIMARY KEY,      -- SHA-256 hash
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  expires_at  TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);
```

**Security:**
- Tokens stored as SHA-256 hashes
- 7-day expiry (configurable)
- Cascade delete on user deletion

---

#### 3. matches
Records of all completed matches.

```sql
CREATE TABLE matches (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id     UUID      REFERENCES users(id),
  player2_id     UUID      REFERENCES users(id),
  current_emoji  VARCHAR,
  player1_score  FLOAT,
  player2_score  FLOAT,
  winner_id      UUID,
  status         VARCHAR   DEFAULT 'ACTIVE',  -- 'ACTIVE', 'COMPLETED', 'ABANDONED'
  created_at     TIMESTAMP DEFAULT NOW(),
  completed_at   TIMESTAMP
);
```

**Purpose:**
- Match history and analytics
- ELO calculation verification
- Dispute resolution

---

#### 4. celebrity_faces
Database of celebrity faces for mimicry mode.

```sql
CREATE TABLE celebrity_faces (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  category          VARCHAR(50) NOT NULL CHECK (category IN ('meme', 'celebrity', 'character')),
  image_url         TEXT NOT NULL,
  difficulty        VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  facial_landmarks  JSONB,          -- Pre-computed MediaPipe landmarks
  usage_count       INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at        TIMESTAMP DEFAULT NOW()
);
```

**Categories:**
- `meme`: Viral meme faces (Doge, Drake, etc.)
- `celebrity`: Famous people
- `character`: Fictional characters

---

#### 5. moderation_reports
User-reported inappropriate behavior.

```sql
CREATE TABLE moderation_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            VARCHAR(64) NOT NULL DEFAULT 'unspecified',
  created_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE (match_id, reporter_user_id)  -- One report per match per user
);
```

---

### Indexes

```sql
-- Users
CREATE INDEX idx_users_socket_id ON users(socket_id);
CREATE INDEX idx_users_elo ON users(elo);

-- Matches
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_player1_id ON matches(player1_id);
CREATE INDEX idx_matches_player2_id ON matches(player2_id);

-- Sessions
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Moderation
CREATE INDEX idx_moderation_reports_reported_user ON moderation_reports(reported_user_id);

-- Celebrity Faces
CREATE INDEX idx_celebrity_faces_category ON celebrity_faces(category);
CREATE INDEX idx_celebrity_faces_difficulty ON celebrity_faces(difficulty);
CREATE INDEX idx_celebrity_faces_usage ON celebrity_faces(usage_count);
```

---

## API Endpoints

### Signaling Server (Port 3001)

#### User Management

**POST /api/users/onboard**
Create new user profile during first visit.

Request:
```json
{
  "username": "string",
  "age": 25,
  "verified_gender": "Male" | "Female" | "Other"
}
```

Response:
```json
{
  "id": "uuid",
  "username": "string",
  "elo": 1000,
  "isVIP": false,
  "freeGenderMatchesLeft": 5
}
```

---

**GET /api/users/me?id={userId}**
Fetch user profile by ID.

Response:
```json
{
  "id": "uuid",
  "username": "string",
  "elo": 1000,
  "verified_gender": "Male",
  "is_vip": false,
  "free_matches_left": 5,
  "created_at": "2026-08-30T12:00:00Z"
}
```

---

#### Premium/VIP Status

**GET /api/premium/status?username={name}&userId={id}**
Check VIP status for a user.

Response:
```json
{
  "username": "string",
  "isVIP": true,
  "vipExpiresAt": "2026-12-31T23:59:59Z"
}
```

---

#### Geolocation

**GET /api/geo**
Detect user's country from IP address.

Response:
```json
{
  "ip": "1.2.3.4",
  "countryCode": "US",
  "country": "🇺🇸 United States",
  "source": "header" | "geoip"
}
```

Uses:
1. `CF-IPCountry` header (Cloudflare)
2. `X-Vercel-IP-Country` header (Vercel)
3. `geoip-lite` library fallback

---

#### Authentication (Future)

**POST /api/auth/register**
Email/password registration.

**POST /api/auth/login**
Email/password login.

**POST /api/auth/google**
Google OAuth login.

**POST /api/auth/logout**
User logout (invalidate session).

**GET /api/auth/me**
Get current authenticated user (JWT).

---

### AI Judge Service (Port 8000)

**GET /health**
Health check endpoint.

Response:
```json
{
  "status": "ok",
  "mode": "random" | "ai"
}
```

---

**POST /judge**
Analyze outfit from photo.

Request:
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

Response:
```json
{
  "score": 7.5,
  "verdict": "Drip" | "Drown",
  "roast": "Clean lines, confident energy, zero cringe.",
  "items": [
    {
      "name": "shirt",
      "status": "Drip",
      "reason": "Color palette immaculate"
    },
    {
      "name": "pants",
      "status": "Drown",
      "reason": "Baggy fit clashes with aesthetic"
    }
  ]
}
```

**Score Ranges:**
- 8.0-10.0: "Drip" (Good outfit)
- 1.0-7.9: "Drown" (Needs improvement)

---

## Real-Time Communication

### Socket.io Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_queue` | `{ peerId, country, username, gender, seeking, profile, userId }` | Enter matchmaking queue |
| `leave_queue` | - | Exit matchmaking queue |
| `submit_score` | `{ matchId, score }` | Submit expression score after scan |
| `skip_partner` | - | Skip current match and re-queue |
| `signal` | `{ target, signal }` | WebRTC signaling (STUN/TURN) |
| `chat_message` | `{ message }` | Send chat message to partner |
| `typing` | `{ isTyping }` | Send typing indicator |
| `disconnect` | - | User disconnected |

---

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `waiting` | - | In matchmaking queue (waiting for opponent) |
| `match_started` | `{ matchId, partnerPeerId, partnerUsername, emoji, duration }` | Match found, game starting |
| `countdown_tick` | `{ count }` | Pre-game countdown: 3, 2, 1 |
| `match_result` | `{ winner, player1, player2, elo }` | Match finished, show results |
| `partner_skipped` | - | Partner skipped the match |
| `opponent_disconnected` | - | Partner disconnected |
| `usage_update` | `{ isVIP, freeGenderMatchesLeft }` | Credit/usage update |
| `trigger_paywall` | `{ free_matches_left }` | Show payment modal |
| `vip_status` | `{ username, isVIP }` | VIP status changed |
| `chat_message` | `{ message, sender }` | Receive chat message |
| `partner_typing` | `{ isTyping }` | Partner is typing |

---

### WebRTC Connection (PeerJS)

**Initialization:**
```javascript
const peer = new Peer(peerId, {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
});
```

**Caller (Client A):**
```javascript
const call = peer.call(partnerPeerId, localStream);
call.on('stream', (remoteStream) => {
  videoRef.current.srcObject = remoteStream;
});
```

**Receiver (Client B):**
```javascript
peer.on('call', (call) => {
  call.answer(localStream);
  call.on('stream', (remoteStream) => {
    videoRef.current.srcObject = remoteStream;
  });
});
```

**Benefits:**
- Abstracts WebRTC complexity
- Automatic STUN/TURN fallback
- No server bandwidth usage (P2P)
- Built-in signaling via PeerServer

---

## Security & Authentication

### Authentication Methods

#### 1. Session-Based Authentication
- **Session Storage:** PostgreSQL `sessions` table
- **Token Format:** Random 32-byte string → SHA-256 hash
- **Cookie:** HTTP-only, secure, SameSite=strict
- **Expiry:** 7 days (configurable)

#### 2. Google OAuth 2.0 (Future)
- **Strategy:** Authorization code flow
- **Scopes:** `profile`, `email`
- **Provider:** Google Identity Platform
- **Stored:** `google_id` in users table

---

### Security Measures

#### API Security
- **CORS Whitelist:** Specific origins only
  ```javascript
  const allowedOrigins = [
    'http://localhost:3000',
    'https://emoggle.vercel.app',
    'https://emoggle.com',
    'https://www.emoggle.com'
  ];
  ```
- **Rate Limiting:** (Configured but not enforced yet)
  ```javascript
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100  // 100 requests per window
  });
  ```
- **Input Validation:** All user inputs sanitized
- **SQL Injection Prevention:** Parameterized queries

#### WebRTC Security
- **Peer ID Obfuscation:** Random UUIDs (not user IDs)
- **Media Encryption:** Mandatory DTLS-SRTP
- **IP Privacy:** TURN relay servers prevent direct IP exposure
- **No Recording:** All streams are ephemeral (not stored)

#### Password Security
- **Hashing:** bcrypt with automatic salt
- **Rounds:** 10 (configurable)
- **Never Logged:** Password hashes never appear in logs

---

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────────────────┐
│              Production Deployment              │
├─────────────────────────────────────────────────┤
│                                                 │
│  Frontend:  Vercel                              │
│  - Domain: emoggle.vercel.app                   │
│  - Next.js SSR/SSG                              │
│  - Edge Network CDN (global)                    │
│  - Automatic HTTPS                              │
│  - Preview deployments for PRs                  │
│                                                 │
│  Signaling Server:  Render / Railway            │
│  - Node.js 18+ process                          │
│  - WebSocket support (Socket.io)                │
│  - Auto-scaling based on load                   │
│  - Health checks (readiness probe)              │
│                                                 │
│  AI Judge:  Render / Railway                    │
│  - Python 3.x + FastAPI                         │
│  - Uvicorn ASGI server                          │
│  - Gemini API integration                       │
│                                                 │
│  Database:  PostgreSQL                          │
│  - Managed service (Render / Neon / Supabase)  │
│  - Automatic backups (daily)                    │
│  - Connection pooling (PgBouncer)               │
│  - SSL/TLS required                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### Environment Variables

#### Frontend (`.env.local`)
```bash
# API Endpoints
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://api.emoggle.com
NEXT_PUBLIC_AI_JUDGE_URL=https://ai-judge.emoggle.com

# PeerJS Configuration
NEXT_PUBLIC_PEERJS_HOST=0.peerjs.com
NEXT_PUBLIC_PEERJS_PORT=443
NEXT_PUBLIC_PEERJS_PATH=/
NEXT_PUBLIC_PEERJS_SECURE=true

# RevenueCat (Payment)
NEXT_PUBLIC_REVENUECAT_API_KEY=***
```

#### Signaling Server (`.env`)
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/emoggle

# Security
JWT_SECRET=***
COOKIE_SECRET=***

# CORS
FRONTEND_URL=https://emoggle.vercel.app

# Environment
NODE_ENV=production
PORT=3001
```

#### AI Judge (`.env`)
```bash
# Google Gemini
GEMINI_API_KEY=***
GEMINI_MODEL=gemini-1.5-flash

# Operation Mode
JUDGE_MODE=ai  # or 'random' for testing

# Server
PORT=8000
```

---

## Performance Considerations

### Frontend Optimization

#### 1. Code Splitting
```typescript
// Dynamic imports for heavy components
const MediaPipeFaceContext = dynamic(
  () => import('./context/MediaPipeFaceContext'),
  { ssr: false }  // Client-side only
);

// Route-based splitting (automatic with Next.js App Router)
// Each page in app/ is a separate chunk
```

#### 2. Asset Optimization
- **Images:** Next.js `<Image>` component (automatic WebP conversion)
- **Fonts:** Preload critical fonts, swap for non-critical
- **MediaPipe WASM:** Self-hosted in `/public/mediapipe/` (200KB cached)
- **Video:** WebRTC streams (no server storage)

#### 3. State Management
- **Context API:** Minimal re-renders with proper memoization
- **Local State:** Component-level where possible
- **Memoization:** `useMemo`, `useCallback` for expensive operations
  ```typescript
  const expressionScore = useMemo(() => 
    calculateExpressionScore(landmarks, targetEmoji),
    [landmarks, targetEmoji]
  );
  ```

---

### Backend Optimization

#### 1. In-Memory Caching
```javascript
// O(1) lookups for real-time data
const socketMeta = new Map();          // Socket → User mapping
const activeMatches = new Map();       // Match state
const memoryVipUsers = new Set();      // VIP cache
```

**Trade-off:** Lost on server restart (acceptable for MVP)

#### 2. Database Connection Pooling
```javascript
const pool = new Pool({
  max: 20,                             // Max connections
  idleTimeoutMillis: 30000,            // 30s idle timeout
  connectionTimeoutMillis: 2000,       // 2s connection timeout
  ssl: process.env.NODE_ENV === 'production'
});
```

#### 3. Fallback Mechanisms
- **Database Unavailable:** In-memory matchmaking continues (graceful degradation)
- **Payment Service Down:** Queue requests, process later
- **AI Judge Failure:** Fallback to random scoring

---

### Real-Time Performance

#### Socket.io Configuration
```javascript
const io = new Server(server, {
  pingTimeout: 60000,                  // 60s before disconnect
  pingInterval: 25000,                 // Heartbeat every 25s
  transports: ['websocket', 'polling'],// WebSocket preferred
  cors: { origin: allowedOrigins }
});
```

#### WebRTC Optimization
- **Codec Preference:** VP8/VP9 (video), Opus (audio)
- **Resolution:** 640x480 default (adjustable)
- **Frame Rate:** 30fps (balance quality/bandwidth)
- **Bandwidth Adaptation:** Automatic based on network conditions

---

### Scalability Roadmap

#### Current Limitations
1. **Single Server:** No horizontal scaling
2. **In-Memory State:** Lost on restart
3. **No Redis:** Matchmaking queue not distributed
4. **No Load Balancer:** Single point of failure

#### Future Improvements
1. **Redis Pub/Sub:** Distribute matchmaking across servers
2. **Session Persistence:** Store active matches in Redis
3. **Load Balancing:** Multiple signaling server instances with sticky sessions
4. **Database Read Replicas:** Offload analytics queries
5. **CDN for Static Assets:** CloudFlare/Vercel Edge Network
6. **Monitoring:** Datadog, New Relic, or Prometheus + Grafana

---

## Key Algorithms

### 1. ELO Rating System

**Formula:**
```javascript
function calculateEloShift(playerElo, opponentElo, outcome) {
  const K = 32;  // K-factor (rating volatility)
  
  // Expected score: probability of winning (0-1)
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  
  // Actual outcome: 1 (win), 0.5 (draw), 0 (loss)
  const delta = Math.round(K * (outcome - expected));
  
  return {
    oldElo: playerElo,
    newElo: playerElo + delta,
    delta,
    expected
  };
}
```

**ELO Tiers:**
```javascript
function tierForElo(elo) {
  if (elo < 800)   return "🗿 Statue";
  if (elo < 1200)  return "🌱 Novice";
  if (elo < 1600)  return "🎭 Actor";
  if (elo < 2000)  return "🎬 Pro";
  return "🏆 Jim Carrey";
}
```

---

### 2. Expression Scoring Algorithm

**MediaPipe Face Mesh:** 478 3D facial landmarks

**Scoring Logic:**
```typescript
function calculateExpressionScore(
  landmarks: NormalizedLandmark[],
  targetEmoji: string
): number {
  // 1. Extract facial metrics
  const mouthWidth = distance(landmarks[61], landmarks[291]);
  const mouthHeight = distance(landmarks[13], landmarks[14]);
  const mouthRatio = mouthHeight / mouthWidth;
  
  const leftEye = eyeAspectRatio(landmarks, [33, 160, 158, 133, 153, 144]);
  const rightEye = eyeAspectRatio(landmarks, [362, 385, 387, 263, 373, 380]);
  const eyeOpenness = (leftEye + rightEye) / 2;
  
  const leftBrow = browHeight(landmarks, 70);
  const rightBrow = browHeight(landmarks, 300);
  const browRaise = (leftBrow + rightBrow) / 2;
  
  // 2. Match against emoji profile
  const profile = EMOJI_PROFILES[targetEmoji];
  
  const mouthScore = compareToRange(mouthRatio, profile.mouthRange);
  const eyeScore = compareToRange(eyeOpenness, profile.eyeRange);
  const browScore = compareToRange(browRaise, profile.browRange);
  
  // 3. Weighted average (mouth most important)
  const finalScore = (
    mouthScore * 0.5 +
    eyeScore * 0.3 +
    browScore * 0.2
  ) * 10;  // Scale to 0-10
  
  return Math.min(Math.max(finalScore, 0), 10);
}
```

**Emoji Profiles Example:**
```typescript
const EMOJI_PROFILES = {
  '😂': {
    mouthRange: [0.4, 0.8],   // Wide open mouth
    eyeRange: [0.1, 0.3],     // Squinted eyes
    browRange: [0.6, 1.0]     // Raised eyebrows
  },
  '😐': {
    mouthRange: [0.0, 0.1],   // Closed mouth
    eyeRange: [0.4, 0.6],     // Normal eye opening
    browRange: [0.4, 0.6]     // Neutral brows
  }
  // ... more emojis
};
```

---

### 3. Matchmaking Algorithm

```javascript
function findMatch(currentUser, waitingQueue) {
  // 1. Filter by gender preferences
  const candidates = waitingQueue.filter(candidate => {
    // Skip self
    if (candidate.socketId === currentUser.socketId) return false;
    
    // Check mutual gender preferences
    const currentSeeks = currentUser.seeking || 'Any';
    const candidateSeeks = candidate.seeking || 'Any';
    
    if (currentSeeks !== 'Any' && candidateSeeks !== 'Any') {
      // Both have preferences, must match
      return (
        currentUser.gender === candidateSeeks &&
        candidate.gender === currentSeeks
      );
    } else if (currentSeeks !== 'Any') {
      return candidate.gender === currentSeeks;
    } else if (candidateSeeks !== 'Any') {
      return currentUser.gender === candidateSeeks;
    }
    
    return true;  // Both seeking 'Any'
  });
  
  if (candidates.length === 0) return null;
  
  // 2. Prioritize by ELO proximity (±200 range preferred)
  const closeMatches = candidates.filter(c => 
    Math.abs(currentUser.elo - c.elo) <= 200
  );
  
  if (closeMatches.length > 0) {
    return closeMatches[0];  // FIFO within range
  }
  
  // 3. Fallback: First available (FIFO)
  return candidates[0];
}
```

**Priorities:**
1. Gender preferences (if VIP)
2. ELO proximity (±200)
3. FIFO (first in, first out)

---

## Development Workflow

### Local Setup

#### Prerequisites
- Node.js 18+
- Python 3.8+
- PostgreSQL 14+
- npm or pnpm

#### 1. Clone Repository
```bash
git clone https://github.com/your-org/emoggle.git
cd emoggle
```

#### 2. Setup Database
```bash
# Option 1: Local PostgreSQL
psql -U postgres -c "CREATE DATABASE emoggle;"
psql -U postgres -d emoggle -f schema.sql

# Option 2: Docker
docker run -d \
  --name emoggle-db \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=emoggle \
  postgres:14
```

#### 3. Start Signaling Server
```bash
cd signaling-server
npm install
cp .env.example .env
# Edit .env with DATABASE_URL
npm run dev  # Port 3001
```

#### 4. Start AI Judge
```bash
cd ai-judge
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with GEMINI_API_KEY (or use JUDGE_MODE=random)
python main.py  # Port 8000
```

#### 5. Start Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with API URLs
npm run dev  # Port 3000
```

#### 6. Test Application
- Open http://localhost:3000 in **two separate browser tabs**
- Enter usernames in both tabs
- Click "Live Face Duel"
- Both should match and see each other's video

---

### PowerShell Quick Start Scripts

**`start-backend.ps1`**
```powershell
# Start signaling server and AI judge in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd signaling-server; npm run dev"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai-judge; python main.py"
Write-Host "Backend services started!" -ForegroundColor Green
```

**`start-frontend.ps1`**
```powershell
# Start Next.js frontend
cd frontend
npm run dev
```

---

### Testing Checklist

#### Manual Testing
- [ ] New user onboarding flow
- [ ] Username entry and storage
- [ ] Solo emoji practice mode
- [ ] Live face duel matchmaking
- [ ] WebRTC video connection
- [ ] Expression scoring accuracy
- [ ] Match result display
- [ ] ELO calculation
- [ ] Gender filter (VIP)
- [ ] Fashion judge (photo upload)
- [ ] Chat functionality
- [ ] Skip partner feature
- [ ] Disconnect handling
- [ ] Mobile responsiveness

#### Browser Compatibility
- [ ] Chrome (primary)
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Chrome
- [ ] Mobile Safari

---

## Troubleshooting Guide

### Common Issues

#### 1. "Camera not detected"
**Cause:** Browser permissions denied or HTTPS required

**Solutions:**
- Check browser settings → Privacy & Security → Camera
- Ensure using HTTPS (required for `getUserMedia`)
- Try different browser
- Restart browser after granting permission

---

#### 2. "Failed to connect to partner"
**Cause:** WebRTC connection blocked by firewall/NAT

**Solutions:**
- Check firewall settings
- Configure TURN server relay in PeerJS config
- Try different network (mobile hotspot)
- Verify both users are on compatible browsers

---

#### 3. "Database unavailable"
**Cause:** PostgreSQL connection failed

**Solutions:**
- Verify `DATABASE_URL` in `.env`
- Check PostgreSQL service is running
  ```bash
  # Linux/Mac
  sudo systemctl status postgresql
  
  # Windows
  Get-Service postgresql*
  ```
- Test connection manually:
  ```bash
  psql $DATABASE_URL
  ```
- **Note:** App continues in degraded mode (in-memory matchmaking)

---

#### 4. "MediaPipe loading forever"
**Cause:** WASM files not loading

**Solutions:**
- Verify files exist in `/public/mediapipe/wasm/`
- Check browser console for 404 errors
- Clear browser cache (Ctrl+Shift+R)
- Check CORS headers allow WASM mime type
- Verify CDN URL in MediaPipeContext

---

#### 5. "Socket.io connection failed"
**Cause:** CORS or network issues

**Solutions:**
- Verify `NEXT_PUBLIC_SIGNALING_SERVER_URL` in `.env.local`
- Check signaling server is running (port 3001)
- Review CORS configuration in `signaling-server/index.js`
- Check browser console for CORS errors

---

#### 6. "AI Judge returns errors"
**Cause:** Invalid API key or quota exceeded

**Solutions:**
- Verify `GEMINI_API_KEY` in `ai-judge/.env`
- Check API quota at https://aistudio.google.com/
- Fallback to `JUDGE_MODE=random` for testing
- Review AI judge logs for detailed error messages

---

## Future Roadmap

### Phase 1: Core Stability (Current)
- ✅ Basic matchmaking
- ✅ Live face duel
- ✅ ELO ranking
- ✅ Payment integration (RevenueCat)
- ✅ Solo practice mode
- ✅ Fashion judge
- 🔄 Bug fixes and performance optimization

### Phase 2: Enhanced Features (Q4 2026)
- [ ] Celebrity Face Mimic mode (80% complete)
- [ ] Friend system and private matches
- [ ] Tournaments and leaderboards
- [ ] Match replay system
- [ ] Social sharing improvements
- [ ] Mobile app (React Native)

### Phase 3: Scale & Monetization (Q1 2027)
- [ ] Multi-server architecture (Redis)
- [ ] Advanced analytics dashboard
- [ ] Subscription tiers
- [ ] In-app purchases (emoji packs, themes)
- [ ] Advertising integration
- [ ] Creator monetization

### Phase 4: Platform Expansion (Q2 2027)
- [ ] AI voice mimicry mode
- [ ] Group duels (4-player)
- [ ] Custom emoji uploads
- [ ] Influencer partnerships
- [ ] Regional tournaments
- [ ] Esports integration

---

## Contributing

### Code Style

**TypeScript/JavaScript:**
- ESLint configuration (Next.js default)
- Prettier for formatting
- Functional React components (hooks)
- Async/await over promises
- Descriptive variable names

**Python:**
- PEP 8 style guide
- Type hints for all functions
- FastAPI dependency injection
- Black for code formatting

### Git Workflow
1. Create feature branch: `git checkout -b feature/celebrity-mode`
2. Make changes with descriptive commits
3. Test locally (all three services)
4. Submit pull request with description
5. Code review required
6. Merge to `main` after approval

---

## References

### Official Documentation
- [Next.js 16 Docs](https://nextjs.org/docs)
- [Socket.io](https://socket.io/docs/)
- [PeerJS](https://peerjs.com/docs/)
- [MediaPipe Face Mesh](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Google Gemini API](https://ai.google.dev/docs)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [FastAPI](https://fastapi.tiangolo.com/)

### Key Technologies
- WebRTC: https://webrtc.org/
- ELO Rating: https://en.wikipedia.org/wiki/Elo_rating_system
- Face Landmarks: https://arxiv.org/abs/1907.06724

---

## License

This project is proprietary. All rights reserved.

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/emoggle/issues
- Email: support@emoggle.com
- Discord: https://discord.gg/emoggle

---

**Last Updated:** August 30, 2026
**Version:** 2.0.0
**Maintainers:** Emoggle Development Team
