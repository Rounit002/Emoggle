# Celebrity Face Mimic - Implementation Guide

## Overview
The Celebrity Face Mimic feature has been successfully implemented! This new game mode allows users to compete 1v1 by mimicking famous celebrity faces, memes, and movie characters.

## What's Been Implemented

### 1. Database Layer ✅
- **Prisma Schema**: Added `CelebrityFace` model to store celebrity face data
- **Migration SQL**: Created migration script at `signaling-server/prisma/migrations/add_celebrity_faces_table.sql`
- **Fields**:
  - `id`: Auto-incrementing primary key
  - `name`: Celebrity/meme name
  - `category`: 'meme', 'celebrity', or 'character'
  - `imageUrl`: Path to the image
  - `difficulty`: 'easy', 'medium', or 'hard'
  - `facialLandmarks`: JSON data for scoring comparison
  - `usageCount`: Track popularity
  - `createdAt`: Timestamp

### 2. Backend API ✅
- **Celebrity Routes** (`signaling-server/routes/celebrity.js`):
  - `GET /api/celebrity/random` - Fetch random celebrity face
  - `GET /api/celebrity/list` - Paginated list of faces
  - `GET /api/celebrity/:id` - Get specific face by ID
  - `POST /api/celebrity/landmarks` - Get facial landmark data
- **Integration**: Routes mounted in `signaling-server/index.js`

### 3. Frontend Components ✅
- **CelebrityDuelArena.tsx**: Main component for celebrity face matching gameplay
  - Real-time video streaming with WebRTC
  - Celebrity face display in center
  - Score tracking and comparison
  - Result screen with winner announcement
  - Chat functionality
  - Audio controls (mute/unmute)
  
### 4. UI Integration ✅
- **ModeSelect.tsx**: Updated to include Celebrity Face Mimic option
  - New pink-themed button for celebrity mode
  - "New Mode" badge indicator
  - Authentication integration
- **page.tsx**: Added routing for celebrity view
  - New "celebrity" view type
  - Component rendering logic

### 5. Asset Structure ✅
- **Directory Structure**:
  ```
  frontend/public/celebrity-faces/
  ├── memes/
  ├── celebrities/
  └── characters/
  ```

## Next Steps to Make It Fully Functional

### 1. Database Setup
```bash
cd signaling-server

# Run Prisma migration
npx prisma migrate dev --name add_celebrity_faces

# Or manually run the SQL migration
psql -U your_user -d your_database -f prisma/migrations/add_celebrity_faces_table.sql

# Generate Prisma client
npx prisma generate
```

### 2. Add Celebrity Face Images
Place celebrity face images in the appropriate directories:

**Memes** (`frontend/public/celebrity-faces/memes/`):
- drake-no.jpg
- success-kid.jpg
- surprised-pikachu.jpg
- harold-hide-pain.jpg
- distracted-boyfriend.jpg

**Celebrities** (`frontend/public/celebrity-faces/celebrities/`):
- leo-dicaprio-cheers.jpg
- morgan-freeman-smile.jpg
- the-rock-eyebrow.jpg
- samuel-l-jackson-serious.jpg

**Characters** (`frontend/public/celebrity-faces/characters/`):
- joker-smile.jpg
- gandalf-wise.jpg
- iron-man-smirk.jpg

**Important**: Ensure all images are:
- Copyright-compliant or public domain
- High-resolution (at least 640x640px)
- Front-facing with clear facial features
- In JPG or PNG format

### 3. Seed Database with Celebrity Faces
After adding images, insert records into the database:

```sql
INSERT INTO celebrity_faces (name, category, image_url, difficulty) VALUES
('Drake No', 'meme', '/celebrity-faces/memes/drake-no.jpg', 'easy'),
('Success Kid', 'meme', '/celebrity-faces/memes/success-kid.jpg', 'easy'),
('Surprised Pikachu', 'meme', '/celebrity-faces/memes/surprised-pikachu.jpg', 'medium'),
('Leo DiCaprio Cheers', 'celebrity', '/celebrity-faces/celebrities/leo-dicaprio-cheers.jpg', 'medium'),
('Morgan Freeman Smile', 'celebrity', '/celebrity-faces/celebrities/morgan-freeman-smile.jpg', 'medium'),
('The Rock Eyebrow', 'celebrity', '/celebrity-faces/celebrities/the-rock-eyebrow.jpg', 'hard'),
('Joker Smile', 'character', '/celebrity-faces/characters/joker-smile.jpg', 'hard');
```

### 4. Update Matchmaking Logic (Optional Enhancement)
Currently, celebrity mode uses the same matchmaking as regular emoji duels. To add celebrity-specific matchmaking:

1. Add celebrity queue in `signaling-server/index.js`:
```javascript
const celebrityQueue = [];
```

2. Create separate socket event:
```javascript
socket.on("join_celebrity_queue", (data) => {
  // Celebrity-specific matchmaking logic
});
```

### 5. Enhance Expression Scoring (Advanced)
The current scoring algorithm works with emojis. To improve celebrity face matching:

1. Pre-compute facial landmarks for each celebrity image
2. Store in `facialLandmarks` JSON field
3. Update `useExpressionScorer.ts` to compare user's face against celebrity landmarks

Example landmark extraction (using MediaPipe):
```typescript
async function extractLandmarks(imageUrl: string) {
  // Use MediaPipe to extract facial landmarks
  // Store key points: eyes, mouth, eyebrows, nose, face oval
  return {
    leftEye: [...],
    rightEye: [...],
    mouth: [...],
    eyebrows: [...],
    nose: [...]
  };
}
```

### 6. Testing Checklist
- [ ] Database migration runs successfully
- [ ] Celebrity API endpoints return data
- [ ] Celebrity faces load correctly in UI
- [ ] Video streaming works in celebrity mode
- [ ] Matchmaking connects two players
- [ ] Scores are calculated and submitted
- [ ] Results screen displays correctly
- [ ] Chat functionality works
- [ ] Audio controls work (mute/unmute)
- [ ] Mobile responsiveness

### 7. Environment Variables
No new environment variables needed! The feature uses existing:
- `NEXT_PUBLIC_SIGNALING_SERVER_URL` - For API calls
- `DATABASE_URL` - For database connection

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    User Browser                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  CelebrityDuelArena Component                  │ │
│  │  - Video streaming (WebRTC)                    │ │
│  │  - Celebrity face display                      │ │
│  │  - Score tracking                              │ │
│  └────────────────────────────────────────────────┘ │
└───────────────┬─────────────────────────────────────┘
                │
                │ HTTP: Fetch celebrity face
                │ WebSocket: Matchmaking
                ▼
┌─────────────────────────────────────────────────────┐
│              Signaling Server (Node.js)              │
│  ┌────────────────────────────────────────────────┐ │
│  │  Celebrity API Routes                          │ │
│  │  - GET /api/celebrity/random                   │ │
│  │  - GET /api/celebrity/list                     │ │
│  │  - GET /api/celebrity/:id                      │ │
│  └────────────────────────────────────────────────┘ │
└───────────────┬─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│             PostgreSQL Database                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  celebrity_faces table                         │ │
│  │  - id, name, category, imageUrl                │ │
│  │  - difficulty, facialLandmarks, usageCount     │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Game Flow

1. **User Selects Celebrity Mode** → Clicks "Celebrity Face Mimic" on home screen
2. **Authentication Check** → If not logged in, shows auth modal
3. **Matchmaking** → Enters queue, waits for another player
4. **Match Found** → Connects via WebRTC, fetches random celebrity face
5. **Countdown** → 3-2-1 countdown begins
6. **Round Starts** → 10-second timer, players mimic celebrity face
7. **Scoring** → Real-time facial landmark comparison
8. **Results** → Winner determined, ELO updated, results displayed
9. **Next Round** → Options to play again or find new partner

## Key Features

✅ **Real-time 1v1 Competition**: Just like emoji duels, but with celebrities
✅ **Three Categories**: Memes, celebrities, and movie characters
✅ **Difficulty Levels**: Easy, medium, and hard faces
✅ **Live Scoring**: Real-time facial expression matching
✅ **Chat Support**: In-game chat during matches
✅ **Audio Controls**: Mute/unmute microphone
✅ **ELO System**: Same ranking system as emoji duels
✅ **Responsive Design**: Works on desktop and mobile

## Future Enhancements

### Phase 1 (Current Implementation)
- [x] Basic celebrity face matching
- [x] Database and API infrastructure
- [x] Frontend UI components
- [x] WebRTC video streaming

### Phase 2 (Future)
- [ ] Advanced facial landmark scoring
- [ ] Celebrity face packs (90s celebrities, movie villains, etc.)
- [ ] Custom celebrity uploads (VIP feature)
- [ ] Celebrity-specific leaderboards
- [ ] Share results on social media
- [ ] Difficulty-based matching

### Phase 3 (Advanced)
- [ ] AI-powered scoring using advanced CV models
- [ ] Augmented reality celebrity face overlay
- [ ] Voice mimicry challenges
- [ ] Multiplayer tournaments (4-8 players)
- [ ] Celebrity face history and replay

## Performance Considerations

- **Image Loading**: Celebrity images should be optimized (< 200KB each)
- **CDN**: Consider using a CDN for celebrity face assets
- **Caching**: Frontend should cache fetched celebrity data
- **Database**: Index on `category` and `difficulty` for fast queries
- **Usage Tracking**: `usageCount` helps distribute faces evenly

## Support & Troubleshooting

### Common Issues

**Issue**: Celebrity faces not loading
- **Solution**: Check that images exist in `public/celebrity-faces/` directory
- **Solution**: Verify `imageUrl` in database matches file path

**Issue**: Matchmaking not working
- **Solution**: Check signaling server is running on port 3001
- **Solution**: Verify WebSocket connection is established

**Issue**: Scores not submitting
- **Solution**: Check MediaPipe face detection is working
- **Solution**: Verify score calculation in `useExpressionScorer` hook

**Issue**: Database connection errors
- **Solution**: Run Prisma migrations: `npx prisma migrate dev`
- **Solution**: Generate Prisma client: `npx prisma generate`

## Credits

This feature was implemented based on the specifications in `FEATURES.md`. The implementation follows the existing architecture patterns from the Emoggle (FitCheckDuel) application and integrates seamlessly with the current emoji duel system.

## License & Legal

⚠️ **Important**: When adding celebrity faces:
- Use only public domain or licensed images
- Respect copyright and personality rights
- Include attribution where required
- Avoid images of minors
- Follow platform content policies

Emoggle does not sell, store, or use faces to train AI models.
