# Emoggle - Application Features Documentation

## Overview
Emoggle is a real-time face expression matching platform where users compete by mimicking emojis and celebrity expressions using facial recognition technology.

---

## Existing Features

### 1. Live Face Duel
**Description:** A competitive 1v1 real-time face matching game where two random strangers compete to match the same emoji expression.

**Key Components:**
- Real-time video connection using WebRTC (PeerJS)
- Socket.io-based matchmaking system
- MediaPipe face detection and landmark tracking
- Expression scoring algorithm (0-10 scale)
- ELO-based ranking system with tiers (Statue, Bronze, Silver, etc.)
- Live audio communication with mute/unmute controls
- Chat functionality with typing indicators
- Country-based geo-location display
- Gender preference matching (VIP feature)
- 10-second round timer
- Real-time score comparison and leaderboard

**User Flow:**
1. User selects "Live Face Duel" mode
2. Choose match preference (Anyone/Male/Female)
3. System finds another online user
4. 3-2-1 countdown starts
5. Random emoji appears in center
6. Both users make the emoji face for 10 seconds
7. Real-time scores displayed during the round
8. Final scores compared, ELO updated
9. Results displayed with winner announcement
10. Option to skip partner or continue with same person

**Technical Stack:**
- Frontend: Next.js, React, Framer Motion
- Video: PeerJS (WebRTC)
- Matchmaking: Socket.io + Express
- Face Detection: MediaPipe Face Mesh
- Scoring: Custom geometry-based algorithm

---

### 2. Solo Emoji Scan
**Description:** A single-player practice mode where users can test their emoji mimicry skills without competing against others.

**Key Components:**
- Solo face scanning without matchmaking
- Self-paced gameplay (user starts when ready)
- Same MediaPipe face detection system
- Instant scoring feedback
- Ability to try multiple emojis
- Best score tracking within session

**User Flow:**
1. User selects "Solo Emoji Scan" mode
2. Random emoji displayed in target box
3. User clicks "Start Scan" when ready
4. 10-second timer begins
5. Real-time score updates during scanning
6. Final score displayed with feedback
7. Options: "Try Again" or "New Emoji"

**Technical Stack:**
- Frontend: Next.js, React, Framer Motion
- Face Detection: MediaPipe Face Mesh
- Local scoring without server communication

---

## New Feature: Celebrity Face Mimic

### 3. Celebrity Face Mimic (Implementation Plan)

**Description:** A 1v1 competitive mode where two strangers are matched and must mimic famous celebrity or meme faces that appear in the middle of the screen. This combines the social aspect of Live Face Duel with the challenge of replicating specific celebrity expressions.

---

### Implementation Plan

#### Phase 1: Database & Asset Setup

**1.1 Celebrity Face Database**
- Create a curated collection of celebrity and meme faces
- Categories:
  - Classic memes (Drakeposting, Success Kid, Pepe, etc.)
  - Celebrity expressions (famous photos/moments)
  - Movie character faces
  - Iconic reaction faces
- Image requirements:
  - High-resolution front-facing photos
  - Clear facial features
  - Various expressions (serious, happy, shocked, etc.)
  - Copyright-compliant or public domain images

**Storage Structure:**
```
/public/celebrity-faces/
  /memes/
    - drake-no.jpg
    - success-kid.jpg
    - surprised-pikachu.jpg
  /celebrities/
    - leo-dicaprio-cheers.jpg
    - morgan-freeman-smile.jpg
  /characters/
    - joker-smile.jpg
```

**1.2 Database Schema**
```sql
CREATE TABLE celebrity_faces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'meme', 'celebrity', 'character'
  image_url TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium', -- 'easy', 'medium', 'hard'
  facial_landmarks JSONB, -- Pre-computed landmark data for comparison
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### Phase 2: Frontend Components

**2.1 New Component: CelebrityDuelArena.tsx**

Based on `DuelArena.tsx` with modifications:

```typescript
// Key differences from standard DuelArena:
interface CelebrityDuelArenaProps {
  onBack: () => void;
  initialSeeking?: MatchSeeking;
}

// New state additions:
const [celebrityFace, setCelebrityFace] = useState<CelebrityFace | null>(null);
const [celebrityImageLoaded, setCelebrityImageLoaded] = useState(false);
```

**Key Features:**
- Celebrity face image displayed in center (replacing emoji)
- Same WebRTC peer connection as Live Duel
- Modified scoring algorithm to compare against celebrity face landmarks
- Visual overlay showing target celebrity face while users mimic

**2.2 Component: CelebrityFaceTarget.tsx**

New component for displaying the celebrity face:

```typescript
interface CelebrityFaceTargetProps {
  celebrityFace: CelebrityFace;
  isPlaying: boolean;
  timeRemaining: number;
}

// Display features:
// - Celebrity/meme image in animated frame
// - Name/context label
// - Difficulty indicator
// - Countdown timer overlay
// - Pulsing/glowing effect during active round
```

---

#### Phase 3: Backend Integration

**3.1 Matchmaking Updates**

Extend `signaling-server/index.js`:

```javascript
// Add new mode to matchmaking
const MATCH_MODES = {
  EMOJI_DUEL: 'emoji_duel',
  CELEBRITY_MIMIC: 'celebrity_mimic'
};

// Separate queue for celebrity mode
const celebrityQueue = new Map();

// Match users specifically looking for celebrity mode
socket.on('celebrity:search', (seeking) => {
  // Similar to existing matchmaking but for celebrity mode
  // Assign random celebrity face to the match
});
```

**3.2 Celebrity Face API Endpoints**

New file: `signaling-server/routes/celebrity.js`

```javascript
// GET /api/celebrity/random
// Returns a random celebrity face for the match

// GET /api/celebrity/list
// Returns paginated list of available faces

// POST /api/celebrity/landmarks
// Accepts celebrity face, returns computed landmarks for scoring
```

**3.3 Database Integration**

Add to `signaling-server/db.js`:

```javascript
// Query celebrity faces by difficulty
async function getCelebrityFace(difficulty = null) {
  if (difficulty) {
    return await prisma.celebrityFace.findFirst({
      where: { difficulty },
      orderBy: { usage_count: 'asc' }
    });
  }
  return await prisma.celebrityFace.findFirst({
    orderBy: { usage_count: 'asc' }
  });
}

// Update usage statistics
async function incrementCelebrityUsage(id) {
  await prisma.celebrityFace.update({
    where: { id },
    data: { usage_count: { increment: 1 } }
  });
}
```

---

#### Phase 4: Face Comparison Algorithm

**4.1 Enhanced Expression Scorer**

Extend `frontend/app/hooks/useExpressionScorer.ts`:

```typescript
interface CelebrityComparisonMode {
  mode: 'celebrity';
  targetLandmarks: FaceLandmark[];
  targetImage: string;
}

// New scoring algorithm:
// 1. Extract user's face landmarks via MediaPipe
// 2. Compare key facial features to celebrity landmarks:
//    - Eye shape and position
//    - Mouth shape and expression
//    - Eyebrow angle and position
//    - Face tilt and orientation
//    - Nose position
// 3. Calculate similarity score (0-10)
```

**4.2 Landmark Extraction**

Pre-process celebrity images to extract facial landmarks:

```typescript
// Utility function to pre-compute landmarks
async function extractCelebrityLandmarks(imageUrl: string) {
  // Use MediaPipe or similar to extract key points
  // Store in database for fast comparison during gameplay
  return {
    leftEye: [...],
    rightEye: [...],
    mouth: [...],
    eyebrows: [...],
    nose: [...],
    faceOval: [...]
  };
}
```

---

#### Phase 5: Game Flow Implementation

**5.1 Match Flow**

```
1. USER A clicks "Celebrity Face Mimic"
2. USER A enters matchmaking queue (celebrity mode)
3. USER B clicks "Celebrity Face Mimic"
4. System matches USER A + USER B
5. WebRTC connection established
6. Server selects random celebrity face
7. Both clients receive celebrity face data
8. 3-2-1 countdown
9. Celebrity face appears in center
10. 10-second round begins
11. Both users mimic the celebrity face
12. Real-time scoring based on landmark comparison
13. Round ends, scores compared
14. Winner determined, ELO updated
15. New celebrity face selected for next round
```

**5.2 UI/UX Layout**

```
┌─────────────────────────────────────────┐
│  Header: Emoggle | Celebrity Mimic Mode │
├──────────────┬──────────────┬────────────┤
│              │              │            │
│   USER A     │  CELEBRITY   │   USER B   │
│   VIDEO      │    FACE      │   VIDEO    │
│              │   TARGET     │            │
│  Score: 7.5  │   [IMAGE]    │  Score: 8.2│
│              │              │            │
│              │  Timer: 7s   │            │
├──────────────┴──────────────┴────────────┤
│  Chat Box | Skip | Stop                  │
└─────────────────────────────────────────┘
```

---

#### Phase 6: Additional Features

**6.1 VIP Features for Celebrity Mode**
- Access to exclusive celebrity faces
- Difficulty level selection
- Extended round time (15s instead of 10s)
- Celebrity face history/replay

**6.2 Leaderboard Integration**
- Separate ELO rankings for Celebrity Mimic mode
- "Best Celebrity Mimics" leaderboard
- Achievement badges for specific celebrities

**6.3 Social Features**
- Save best celebrity mimic moments
- Share score cards on social media
- Challenge friends to specific celebrity faces

---

#### Phase 7: Testing & Launch

**7.1 Testing Checklist**
- [ ] Celebrity face loading and display
- [ ] Landmark extraction accuracy
- [ ] Scoring algorithm fairness
- [ ] Matchmaking with separate queue
- [ ] WebRTC connection stability
- [ ] Performance with multiple concurrent matches
- [ ] Mobile responsiveness
- [ ] Cross-browser compatibility

**7.2 Beta Launch Strategy**
1. Deploy to staging environment
2. Invite limited users for beta testing
3. Collect feedback on:
   - Scoring accuracy
   - Celebrity face variety
   - Fun factor and engagement
4. Iterate based on feedback
5. Production deployment

**7.3 Performance Optimization**
- Lazy load celebrity images
- CDN for celebrity face assets
- Caching strategy for frequently used faces
- Optimize landmark extraction algorithm

---

## Technical Implementation Details

### File Structure

```
frontend/
├── app/
│   ├── components/
│   │   ├── CelebrityDuelArena.tsx          [NEW]
│   │   ├── CelebrityFaceTarget.tsx         [NEW]
│   │   ├── CelebrityScoreCard.tsx          [NEW]
│   │   └── ModeSelect.tsx                  [MODIFIED]
│   ├── hooks/
│   │   ├── useCelebrityMatching.ts         [NEW]
│   │   └── useExpressionScorer.ts          [MODIFIED]
│   └── page.tsx                            [MODIFIED]
├── public/
│   └── celebrity-faces/                    [NEW]
│       ├── memes/
│       ├── celebrities/
│       └── characters/

signaling-server/
├── routes/
│   └── celebrity.js                        [NEW]
├── db.js                                   [MODIFIED]
└── index.js                                [MODIFIED]

database/
└── migrations/
    └── add_celebrity_faces_table.sql       [NEW]
```

---

## Configuration & Environment Variables

```env
# Frontend (.env.local)
NEXT_PUBLIC_CELEBRITY_MODE_ENABLED=true
NEXT_PUBLIC_CELEBRITY_CDN_URL=https://cdn.emoggle.com/celebrity-faces

# Backend (.env)
CELEBRITY_FACES_BUCKET=emoggle-celebrity-faces
CELEBRITY_SCORING_THRESHOLD=6.0
MAX_CELEBRITY_QUEUE_WAIT_TIME=30000
```

---

## Estimated Development Timeline

| Phase | Task | Duration | Priority |
|-------|------|----------|----------|
| 1 | Database & Asset Setup | 3-5 days | High |
| 2 | Frontend Components | 5-7 days | High |
| 3 | Backend Integration | 4-6 days | High |
| 4 | Face Comparison Algorithm | 7-10 days | Critical |
| 5 | Game Flow Implementation | 5-7 days | High |
| 6 | Additional Features | 5-7 days | Medium |
| 7 | Testing & Launch | 5-7 days | High |

**Total Estimated Time:** 5-7 weeks

---

## Success Metrics

- Daily active users in Celebrity Mimic mode
- Average session duration
- Match completion rate
- User retention rate
- Celebrity face variety usage
- Positive user feedback percentage

---

## Future Enhancements

1. **Custom Celebrity Uploads:** Allow VIP users to upload custom celebrity faces
2. **Multiplayer Tournaments:** 4-8 player celebrity mimic tournaments
3. **AI Celebrity Scoring:** Use advanced AI models for more accurate scoring
4. **Celebrity Voice Mimicry:** Add audio mimicry challenges
5. **Augmented Reality Filters:** Real-time celebrity face overlay during gameplay
6. **Celebrity Face Packs:** Themed packs (90s celebrities, movie villains, etc.)

---

## Conclusion

The Celebrity Face Mimic feature builds on Emoggle's existing infrastructure while introducing a fresh, entertaining twist to the platform. By leveraging the proven matchmaking and face detection systems, this feature can be implemented efficiently while providing significant value to users.

The key differentiator is the social competition aspect combined with recognizable celebrity and meme faces, which increases shareability and viral potential compared to abstract emoji expressions.
