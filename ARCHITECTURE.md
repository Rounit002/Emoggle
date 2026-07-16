# FitCheckDuel (Emoggle) - System Architecture

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

---

## System Overview

**FitCheckDuel (formerly Emoggle)** is a real-time competitive platform where users match facial expressions through WebRTC video connections. The application supports multiple game modes including live face duels, solo practice, and planned celebrity face mimicry.

### Key Capabilities
- Real-time peer-to-peer video communication
- Facial landmark detection and expression scoring
- ELO-based matchmaking and ranking system
- Gender-filtered matchmaking
- AI-powered fashion judging
- Multi-region deployment support

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (React + TypeScript)                   │   │
│  │  - App Router Pages                                      │   │
│  │  - React Components (DuelArena, VideoPanel, etc.)       │   │
│  │  - Context Providers (Auth, MediaPipe, UserProfile)     │   │
│  │  - Custom Hooks (useMatchmaking, useExpressionScorer)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │ HTTP/WS         │ WebRTC          │ HTTP              │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 │                 ▼
┌─────────────────────┐     │      ┌─────────────────────┐
│  Signaling Server   │     │      │   AI Judge Service  │
│  (Node.js/Express)  │     │      │   (Python/FastAPI)  │
│  ┌───────────────┐  │     │      │  ┌───────────────┐  │
│  │ Socket.io Hub │  │     │      │  │ Gemini Vision │  │
│  │ Matchmaking   │  │     │      │  │ Fashion Judge │  │
│  │ Queue Mgmt    │  │     │      │  └───────────────┘  │
│  │ Auth Routes   │  │     │      │  Port: 8000         │
│  └───────────────┘  │     │      └─────────────────────┘
│  Port: 3001         │     │
└──────────┬──────────┘     │
           │                │
           ▼                ▼
┌─────────────────────────────────┐
│     PostgreSQL Database         │
│  ┌──────────────────────────┐   │
│  │ - users (profiles, ELO)  │   │
│  │ - matches (game history) │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘

        WebRTC P2P Connection
┌──────────┐                 ┌──────────┐
│ Client A │◄───────────────►│ Client B │
│ (PeerJS) │    Direct Video │ (PeerJS) │
└──────────┘                 └──────────┘
```

---
## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2.6 | React framework with App Router |
| **React** | 19.2.4 | UI component library |
| **TypeScript** | ^5 | Type-safe JavaScript |
| **Tailwind CSS** | ^4 | Utility-first styling |
| **Framer Motion** | 12.40.0 | Animation library |
| **Socket.io Client** | 4.8.3 | WebSocket client |
| **PeerJS** | 1.5.5 | WebRTC wrapper |
| **MediaPipe** | 0.10.35 | Face detection/landmarks |
| **face-api.js** | 0.22.2 | Additional face analysis |
| **react-webcam** | 7.2.0 | Webcam access |

### Backend (Signaling Server)
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **Express** | HTTP server framework |
| **Socket.io** | WebSocket server |
| **Prisma** | ORM for database |
| **PostgreSQL** | Relational database |
| **JWT** | Authentication tokens |
| **geoip-lite** | IP geolocation |
| **cookie-parser** | Cookie handling |
| **crypto** | Encryption & hashing |

### AI Judge Service
| Technology | Purpose |
|------------|---------|
| **Python 3.x** | Runtime |
| **FastAPI** | Web framework |
| **Uvicorn** | ASGI server |
| **Pydantic** | Data validation |
| **Google Gemini** | Vision AI model |
| **google-generativeai** | Gemini SDK |

---
## Core Components

### 1. Frontend Components

#### Pages
- **`app/page.tsx`** - Landing page with mode selection
- **`app/profile/page.tsx`** - User profile and statistics
- **`app/contact/page.tsx`** - Contact form
- **`app/privacy/page.tsx`** - Privacy policy
- **`app/terms/page.tsx`** - Terms of service
- **`app/refund/page.tsx`** - Refund policy

#### Core Components
```
app/components/
├── AnalyzingOverlay.tsx      # AI fashion analysis loading state
├── AuthModal.tsx              # Login/signup modal
├── ChatBox.tsx                # In-game chat component
├── Countdown.tsx              # Pre-match countdown timer
├── DuelArena.tsx              # Main 1v1 game arena
├── Footer.tsx                 # Footer navigation
├── ModeSelect.tsx             # Game mode selection screen
├── MyProfileCard.tsx          # User profile card
├── OnboardingModal.tsx        # First-time user onboarding
├── ScoreCard.tsx              # Match result display
├── SoloFaceJudge.tsx          # Solo practice mode
├── UploadJudge.tsx            # Fashion photo upload judge
└── VideoPanel.tsx             # Peer video display panel
```

#### Context Providers
```
app/context/
├── AuthContext.tsx            # User authentication state
├── MediaPipeFaceContext.tsx   # Face detection initialization
└── UserProfileContext.tsx     # User profile management
```

#### Custom Hooks
```
app/hooks/
├── useExpressionScorer.ts     # Face landmark scoring algorithm
└── useMatchmaking.ts          # Socket.io matchmaking logic
```

---
### 2. Signaling Server Components

#### Main Entry Point
- **`index.js`** - Express + Socket.io server initialization
  - CORS configuration
  - WebSocket event handlers
  - Matchmaking queue management
  - Active match tracking
  - ELO calculation

#### Routing
```
routes/
└── auth.js                    # Authentication endpoints (email/password, Google OAuth)
```

#### Database Layer
- **`db.js`** - PostgreSQL connection pool
- **`prisma/schema.prisma`** - Database schema definition

#### Middleware
```
middleware/
└── verifyToken.js             # JWT verification middleware
```

#### Key In-Memory State
```javascript
const waitingQueue = [];              // Matchmaking queue
const socketMeta = new Map();         // Socket metadata (userId, peerId, etc.)
const activeMatches = new Map();      // Active match state
const memoryVipUsers = new Set();     // VIP user cache
```

---

### 3. AI Judge Service

#### Entry Point
- **`main.py`** - FastAPI application
  - `/health` - Service health check
  - `/judge` - Fashion critique endpoint

#### Operational Modes
1. **Random Mode** (`JUDGE_MODE=random`)
   - Fallback mode without AI
   - Generates random scores and generic feedback
   - 3-6 second simulated processing time

2. **AI Mode** (`JUDGE_MODE=ai`)
   - Google Gemini Vision API integration
   - Real outfit analysis from webcam/photo
   - Detailed item-by-item critique
   - Score (1.0-10.0), verdict (Drip/Drown), roast message

---
## Data Flow

### 1. User Registration & Authentication Flow

```
┌──────────┐
│  Client  │
└─────┬────┘
      │ 1. First visit (no userId in localStorage)
      ├──► Display OnboardingModal
      │
      │ 2. Submit: { username, age, verified_gender }
      ├──► POST /api/users/onboard
      │
      ▼
┌─────────────────┐
│ Signaling Server│
└────────┬────────┘
         │ 3. INSERT INTO users (id, username, age, verified_gender)
         ├──► PostgreSQL
         │
         │ 4. Return { id: UUID }
         ├──► Client stores userId in localStorage
         │
         ▼
      Client can now join matchmaking
```

### 2. Matchmaking Flow

```
Client A                    Signaling Server                    Client B
   │                               │                               │
   │ 1. socket.emit('join_queue')  │                               │
   ├──────────────────────────────►│                               │
   │   { peerId, seeking, userId } │                               │
   │                               │◄──────────────────────────────┤
   │                               │ 2. socket.emit('join_queue')  │
   │                               │                               │
   │                               │ 3. Match found!               │
   │                               │   - Check gender preferences  │
   │                               │   - Create match in DB        │
   │                               │   - Generate match room       │
   │                               │                               │
   │◄──────────────────────────────┤                               │
   │ 4. emit('match_started')      │──────────────────────────────►│
   │    { matchId, partnerPeerId } │    emit('match_started')      │
   │                               │                               │
   │◄──────────────────────────────┼──────────────────────────────►│
   │         5. WebRTC P2P Connection (via PeerJS)                 │
   │                                                               │
```

### 3. Live Face Duel Flow

```
1. Match Started
   ↓
2. 3-Second Countdown (server-controlled)
   - Server emits 'countdown_tick' every second
   ↓
3. Random Emoji Selected
   - Server picks emoji and sends to both clients
   ↓
4. 10-Second Scan Phase (client-controlled timer)
   - MediaPipe detects faces
   - useExpressionScorer calculates scores
   - Real-time score updates via Socket.io
   ↓
5. Submit Scores
   - Both clients emit 'submit_score'
   ↓
6. Server Finalizes Match
   - Calculate ELO changes
   - Update database
   - Determine winner
   ↓
7. Results Broadcast
   - emit('match_result') to both clients
   - Display ScoreCard component
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socket_id         VARCHAR UNIQUE,
  username          VARCHAR DEFAULT 'anonymous',
  age               INT,
  verified_gender   VARCHAR,
  elo               INT DEFAULT 1000,
  is_vip            BOOLEAN DEFAULT false,
  free_matches_left INT DEFAULT 5,
  created_at        TIMESTAMP DEFAULT NOW(),
  
  -- Auth fields
  email             VARCHAR UNIQUE,
  password_hash     VARCHAR,
  auth_provider     VARCHAR DEFAULT 'local',
  google_id         VARCHAR UNIQUE
);
```

### Matches Table
```sql
CREATE TABLE matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id     UUID REFERENCES users(id),
  player2_id     UUID REFERENCES users(id),
  current_emoji  VARCHAR,
  player1_score  FLOAT,
  player2_score  FLOAT,
  winner_id      UUID,
  status         VARCHAR DEFAULT 'ACTIVE',
  created_at     TIMESTAMP DEFAULT NOW(),
  completed_at   TIMESTAMP
);
```

### Indexes
```sql
CREATE INDEX idx_users_socket_id ON users(socket_id);
CREATE INDEX idx_users_elo ON users(elo);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_player1_id ON matches(player1_id);
CREATE INDEX idx_matches_player2_id ON matches(player2_id);
```

---
## API Endpoints

### Signaling Server (Port 3001)

#### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/onboard` | Create new user profile |
| GET | `/api/users/me?id={userId}` | Fetch user profile by ID |

**Request Body (onboard):**
```json
{
  "username": "string",
  "age": 25,
  "verified_gender": "Male" | "Female" | "Other"
}
```

**Response:**
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

#### Premium/Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/premium/status?username={name}&userId={id}` | Check VIP status |

---

#### Geolocation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/geo` | Get user country from IP |

**Response:**
```json
{
  "ip": "1.2.3.4",
  "countryCode": "US",
  "country": "🇺🇸 United States",
  "source": "header" | "geoip"
}
```

---
#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Email/password registration |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/google` | Google OAuth login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user (JWT) |

---

### AI Judge Service (Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| POST | `/judge` | Analyze outfit photo |

**Judge Request:**
```json
{
  "image": "data:image/jpeg;base64,..."
}
```

**Judge Response:**
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
    }
  ]
}
```

---

## Real-Time Communication

### Socket.io Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_queue` | `{ peerId, country, username, gender, seeking, profile, userId }` | Enter matchmaking |
| `leave_queue` | - | Exit matchmaking |
| `submit_score` | `{ matchId, score }` | Submit round score |
| `skip_partner` | - | Skip current partner |
| `signal` | `{ target, signal }` | WebRTC signaling |
| `chat_message` | `{ message }` | Send chat message |
| `typing` | `{ isTyping }` | Typing indicator |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `waiting` | - | In matchmaking queue |
| `match_started` | `{ matchId, partnerPeerId, partnerUsername, emoji, duration }` | Match found |
| `countdown_tick` | `{ count }` | Pre-game countdown |
| `match_result` | `{ winner, player1, player2, elo }` | Match finished |
| `partner_skipped` | - | Partner left |
| `opponent_disconnected` | - | Partner disconnected |
| `usage_update` | `{ isVIP, freeGenderMatchesLeft }` | Credit update |
| `trigger_paywall` | `{ free_matches_left }` | Show payment modal |
| `vip_status` | `{ username, isVIP }` | VIP status changed |
| `chat_message` | `{ message, sender }` | Receive chat message |
| `partner_typing` | `{ isTyping }` | Partner typing status |

---
### WebRTC Connection (PeerJS)

```javascript
// Client A (Caller)
const peer = new Peer(peerId);
const call = peer.call(partnerPeerId, localStream);
call.on('stream', (remoteStream) => {
  // Display partner's video
});

// Client B (Receiver)
peer.on('call', (call) => {
  call.answer(localStream);
  call.on('stream', (remoteStream) => {
    // Display partner's video
  });
});
```

**Benefits of PeerJS:**
- Abstracts WebRTC complexity
- Automatic STUN/TURN server configuration
- Fallback to relay servers if P2P fails
- Built-in signaling via PeerServer

---

## Security & Authentication

### Authentication Methods

#### 1. Local Authentication (Email/Password)
- **Password Hashing:** bcrypt with salt rounds
- **JWT Tokens:** Stored in HTTP-only cookies
- **Token Expiry:** 7 days (configurable)

#### 2. Google OAuth 2.0
- **Strategy:** OAuth 2.0 authorization code flow
- **Scopes:** `profile`, `email`
- **Provider:** Google Identity Platform

### Security Measures

#### API Security
- **CORS:** Whitelist specific origins
- **Rate Limiting:** Prevent abuse (TODO)
- **Input Validation:** Sanitize all user inputs
- **SQL Injection Prevention:** Parameterized queries (Prisma ORM)

#### WebRTC Security
- **Peer ID Obfuscation:** Random UUIDs
- **Media Encryption:** Mandatory DTLS-SRTP
- **No Direct IP Exposure:** Via TURN relays when needed

---

## Deployment Architecture

### Current Setup

```
┌─────────────────────────────────────────────────┐
│              Production Environment             │
├─────────────────────────────────────────────────┤
│                                                 │
│  Frontend:  Vercel (emoggle.vercel.app)        │
│  - Next.js SSR/SSG                              │
│  - Edge Network CDN                             │
│  - Automatic HTTPS                              │
│                                                 │
│  Backend:   Render / Railway (signaling-server) │
│  - Node.js process                              │
│  - WebSocket support                            │
│  - Auto-scaling                                 │
│                                                 │
│  AI Judge:  Render / Railway (ai-judge)         │
│  - Python FastAPI service                       │
│  - Uvicorn ASGI server                          │
│                                                 │
│  Database:  PostgreSQL (Render / Neon)          │
│  - Managed database service                     │
│  - Automatic backups                            │
│  - Connection pooling                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Environment Variables

#### Frontend (.env.local)
```bash
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://api.emoggle.com
NEXT_PUBLIC_AI_JUDGE_URL=https://ai-judge.emoggle.com
NEXT_PUBLIC_PEERJS_HOST=0.peerjs.com
NEXT_PUBLIC_PEERJS_PORT=443
```

#### Signaling Server (.env)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/emoggle
JWT_SECRET=***
FRONTEND_URL=https://emoggle.vercel.app
NODE_ENV=production
```

#### AI Judge (.env)
```bash
GEMINI_API_KEY=***
GEMINI_MODEL=gemini-1.5-flash
JUDGE_MODE=ai
```

---
## Performance Considerations

### Frontend Optimization

#### 1. Code Splitting
- **Dynamic Imports:** Load components on-demand
- **Route-Based Splitting:** Next.js automatic splitting
- **MediaPipe Lazy Loading:** Load only when entering duel mode

```typescript
// Example: Lazy load MediaPipe context
const MediaPipeFaceContext = dynamic(
  () => import('./context/MediaPipeFaceContext'),
  { ssr: false }
);
```

#### 2. Asset Optimization
- **Image Optimization:** Next.js `<Image>` component
- **Font Loading:** Preload critical fonts
- **WASM Files:** MediaPipe WASM modules cached in `/public`

#### 3. State Management
- **Context API:** Minimal re-renders
- **Local State:** Component-level where possible
- **Memoization:** `useMemo`, `useCallback` for expensive operations

---

### Backend Optimization

#### 1. In-Memory Caching
```javascript
const socketMeta = new Map();          // O(1) socket lookups
const activeMatches = new Map();       // O(1) match state access
const memoryVipUsers = new Set();      // O(1) VIP checks
```

#### 2. Database Connection Pooling
```javascript
const pool = new Pool({
  max: 20,                             // Max connections
  idleTimeoutMillis: 30000,            // 30s idle timeout
  connectionTimeoutMillis: 2000,       // 2s connection timeout
});
```

#### 3. Fallback Mechanisms
- **Database Unavailable:** In-memory matchmaking continues
- **Payment Service Down:** Queue requests, retry later
- **AI Judge Failure:** Fallback to random scoring

---

### Real-Time Performance

#### Socket.io Configuration
```javascript
const io = new Server(server, {
  pingTimeout: 60000,                  // 60s before disconnect
  pingInterval: 25000,                 // Heartbeat every 25s
  transports: ['websocket', 'polling'],// WebSocket preferred
  allowEIO3: true,                     // Legacy client support
});
```

#### WebRTC Optimization
- **Codec Preference:** VP8/VP9 for video, Opus for audio
- **Bandwidth Management:** Adaptive bitrate based on network
- **TURN Fallback:** Only when P2P fails

---

### Scalability Considerations

#### Current Limitations
- **Single Server:** No horizontal scaling yet
- **In-Memory State:** Lost on server restart
- **No Redis:** Matchmaking queue not distributed

#### Future Improvements
1. **Redis Pub/Sub:** Distribute matchmaking across servers
2. **Session Persistence:** Store active matches in Redis
3. **Load Balancing:** Multiple signaling server instances
4. **Database Replication:** Read replicas for analytics
5. **CDN for Assets:** Offload static files
6. **Monitoring:** Datadog/New Relic for performance tracking

---

## Monitoring & Logging

### Current Logging

#### Signaling Server
```javascript
console.log('[+] Connected:', socketId);
console.log('[Q] Joining queue:', peerId);
console.log('[M] Match started:', matchId);
console.log('[DB] Database unavailable:', err.message);
```

#### AI Judge
```python
print(f'[Gemini error] {exc}')
```

### Recommended Monitoring

1. **Application Performance Monitoring (APM)**
   - New Relic / Datadog
   - Track response times, error rates
   - Database query performance

2. **Error Tracking**
   - Sentry for frontend/backend errors
   - Stack traces and context

3. **Infrastructure Monitoring**
   - Server CPU/Memory usage
   - Database connections
   - Network latency

4. **Business Metrics**
   - Daily active users
   - Match completion rate
   - Payment conversion rate
   - Average session duration

---
## Key Algorithms

### 1. ELO Rating System

```javascript
function calculateEloShift(playerElo, opponentElo, outcome) {
  const K = 32;  // K-factor (rating change speed)
  
  // Expected score (0-1 probability)
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

// Tier classification
function tierForElo(elo) {
  if (elo <= 1000) return "Statue";
  if (elo <= 1500) return "Novice";
  if (elo <= 2000) return "Actor";
  return "Jim Carrey";
}
```

### 2. Expression Scoring Algorithm

**Face Landmark Comparison:**
```typescript
function calculateExpressionScore(
  userLandmarks: NormalizedLandmark[],
  targetEmoji: string
): number {
  // 1. Extract key facial features
  const mouthWidth = distance(landmarks[61], landmarks[291]);
  const mouthHeight = distance(landmarks[13], landmarks[14]);
  const eyeOpenness = averageEyeAspectRatio(landmarks);
  const eyebrowRaise = eyebrowHeight(landmarks);
  
  // 2. Define ideal ranges for each emoji
  const targetProfile = EMOJI_PROFILES[targetEmoji];
  
  // 3. Calculate similarity scores (0-10)
  const mouthScore = compareToRange(mouthWidth, targetProfile.mouth);
  const eyeScore = compareToRange(eyeOpenness, targetProfile.eyes);
  const browScore = compareToRange(eyebrowRaise, targetProfile.brows);
  
  // 4. Weighted average
  return (mouthScore * 0.5) + (eyeScore * 0.3) + (browScore * 0.2);
}
```

### 3. Matchmaking Algorithm

```javascript
function findMatch(currentUser, waitingQueue) {
  // Filter by gender preferences
  const candidates = waitingQueue.filter(candidate => {
    return profilesCanMatch(currentUser, candidate);
  });
  
  // Priority rules:
  // 1. Skip recently skipped users
  // 2. Prefer similar ELO (±200 range)
  // 3. Prefer same country/region
  // 4. FIFO (first in, first out)
  
  for (const candidate of candidates) {
    if (candidate.socketId === currentUser.skippedSocketId) continue;
    if (Math.abs(currentUser.elo - candidate.elo) > 200) continue;
    
    return candidate;  // Match found
  }
  
  // No ideal match, return first available
  return candidates[0] || null;
}
```

---

## Common Pitfalls & Solutions

### 1. WebRTC Connection Failures

**Problem:** Peer connection fails in restrictive networks

**Solutions:**
- Configure TURN servers for relay
- Implement connection retry logic
- Provide user-friendly error messages
- Fallback to text-only chat mode

### 2. MediaPipe WASM Loading

**Problem:** Large WASM files slow initial load

**Solutions:**
- Self-host WASM files in `/public/mediapipe`
- Lazy load only when entering duel mode
- Show loading indicator with progress
- Cache files aggressively

### 3. Database Connection Exhaustion

**Problem:** Too many concurrent connections

**Solutions:**
- Connection pooling (max 20 connections)
- Fallback to in-memory mode
- Release connections immediately after query
- Use transactions for multi-query operations

---
## Development Workflow

### Local Development Setup

1. **Clone Repository**
```bash
git clone https://github.com/your-org/fitcheckduel.git
cd fitcheckduel
```

2. **Start PostgreSQL Database**
```bash
# Option 1: Local PostgreSQL
psql -U postgres -c "CREATE DATABASE emoggle;"
psql -U postgres -d emoggle -f schema.sql

# Option 2: Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres
```

3. **Start Signaling Server**
```bash
cd signaling-server
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev  # Port 3001
```

4. **Start AI Judge**
```bash
cd ai-judge
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with GEMINI_API_KEY
python main.py  # Port 8000
```

5. **Start Frontend**
```bash
cd frontend
npm install
cp env.example .env.local
# Edit .env.local with API URLs
npm run dev  # Port 3000
```

6. **Access Application**
   - Open http://localhost:3000 in two browser tabs
   - Test matchmaking, video calls, scoring

---

### PowerShell Start Scripts

**`start-backend.ps1`**
```powershell
# Start signaling server and AI judge
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "./signaling-server"
Start-Process -FilePath "python" -ArgumentList "main.py" -WorkingDirectory "./ai-judge"
```

**`start-frontend.ps1`**
```powershell
# Start Next.js frontend
npm run dev --prefix frontend
```

---

## Testing Strategy

### Manual Testing Checklist

#### User Flows
- [ ] New user onboarding
- [ ] Solo emoji scan
- [ ] Live face duel matchmaking
- [ ] Gender filter (VIP)
- [ ] Payment flow
- [ ] Profile page
- [ ] Chat functionality
- [ ] Skip partner
- [ ] Disconnect handling

#### Browser Compatibility
- [ ] Chrome (primary)
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

#### Network Conditions
- [ ] High-speed connection
- [ ] Slow 3G simulation
- [ ] Intermittent connectivity
- [ ] Firewall/NAT traversal

### Automated Testing (TODO)

**Frontend:**
- Jest for unit tests
- React Testing Library for components
- Playwright for E2E tests

**Backend:**
- Jest for API endpoint tests
- Supertest for HTTP assertions
- Mock Socket.io for real-time tests

**AI Judge:**
- pytest for endpoint tests
- Mock Gemini API responses

---
## Future Roadmap

### Phase 1: Core Stability (Current)
- ✅ Basic matchmaking
- ✅ Live face duel
- ✅ ELO ranking
- ✅ Payment integration
- ✅ Solo mode
- 🔄 Bug fixes and performance optimization

### Phase 2: Enhanced Features (Q2 2026)
- [ ] Celebrity Face Mimic mode (see FEATURES.md)
- [ ] Friend system and private matches
- [ ] Tournaments and leaderboards
- [ ] Mobile app (React Native)
- [ ] Social sharing

### Phase 3: Scale & Monetization (Q3 2026)
- [ ] Multi-server architecture (Redis)
- [ ] Advanced analytics dashboard
- [ ] Subscription tiers
- [ ] In-app purchases (emoji packs, themes)
- [ ] Advertising integration

### Phase 4: Platform Expansion (Q4 2026)
- [ ] AI voice mimicry mode
- [ ] Group duels (4-player)
- [ ] Custom emoji uploads
- [ ] Influencer partnerships
- [ ] Regional tournaments

---

## Troubleshooting Guide

### Common Issues

#### 1. "Camera not detected"
**Cause:** Browser permissions denied

**Solution:**
- Check browser settings → Privacy → Camera
- Use HTTPS (required for getUserMedia)
- Reload page after granting permission

#### 2. "Failed to connect to partner"
**Cause:** WebRTC connection blocked

**Solution:**
- Check firewall/antivirus settings
- Use TURN server relay
- Try different network (mobile hotspot)

#### 3. "Database unavailable"
**Cause:** PostgreSQL connection failed

**Solution:**
- Verify DATABASE_URL in .env
- Check PostgreSQL service is running
- Verify network connectivity
- Application falls back to in-memory mode

#### 4. "MediaPipe loading forever"
**Cause:** WASM files not loaded

**Solution:**
- Check `/public/mediapipe/wasm/` files exist
- Verify CORS headers allow WASM loading
- Clear browser cache
- Check network tab for 404 errors

---

## Contributing Guidelines

### Code Style

**TypeScript/JavaScript:**
- Use ESLint configuration
- Prettier for formatting
- Functional components (React)
- Async/await over promises

**Python:**
- PEP 8 style guide
- Type hints for all functions
- FastAPI dependency injection

### Git Workflow

1. Create feature branch: `feature/celebrity-mode`
2. Make changes with descriptive commits
3. Test locally
4. Submit pull request
5. Code review required
6. Merge to `main` after approval

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested locally
- [ ] Manual testing performed
- [ ] Browser compatibility checked

## Screenshots
(if applicable)
```

---
## References & Documentation

### Official Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [Socket.io Documentation](https://socket.io/docs/)
- [PeerJS Documentation](https://peerjs.com/docs/)
- [MediaPipe Face Mesh](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Google Gemini API](https://ai.google.dev/docs)
- [Prisma ORM](https://www.prisma.io/docs)

### Key Technologies
- **WebRTC Primer:** https://webrtc.org/getting-started/overview
- **ELO Rating System:** https://en.wikipedia.org/wiki/Elo_rating_system
- **Face Landmark Detection:** https://arxiv.org/abs/1907.06724

### Internal Documentation
- **FEATURES.md** - Feature specifications and roadmap
- **README.md** - Quick start guide
- **AGENTS.md** - Development agent guidelines (if exists)
- **CLAUDE.md** - AI assistant context (if exists)

---

## Contact & Support

### Development Team
- **Project Lead:** [Contact Info]
- **Backend Developer:** [Contact Info]
- **Frontend Developer:** [Contact Info]
- **AI/ML Engineer:** [Contact Info]

### Support Channels
- **GitHub Issues:** https://github.com/your-org/fitcheckduel/issues
- **Email:** support@emoggle.com
- **Discord:** [Community Server]

---

## Changelog

### Version 0.3.0 (Current)
- AI fashion judge integration
- Gender-based matchmaking
- VIP subscription tier
- Profile management
- Chat functionality

### Version 0.2.0
- Live face duel mode
- ELO ranking system
- Solo emoji scan
- WebRTC video integration
- MediaPipe face detection

### Version 0.1.0
- Initial prototype
- Basic matchmaking
- Simple emoji scoring

---

## License

[Specify License - MIT, Apache 2.0, Proprietary, etc.]

---

## Acknowledgments

- **MediaPipe Team** - Face detection technology
- **Google Gemini** - AI fashion critique
- **PeerJS Community** - WebRTC simplification
- **Vercel** - Frontend hosting platform
- **Render/Railway** - Backend hosting

---

*Last Updated: June 11, 2026*
*Document Version: 1.0*
*Project: FitCheckDuel (Emoggle)*
