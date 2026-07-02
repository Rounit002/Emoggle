# Celebrity Face Mimic - Visual Architecture

## 🎮 Game Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Stop]        CELEBRITY MIMIC         [ Profile ]        │
│                Match the famous face                         │
├───────────────────┬─────────────────┬───────────────────────┤
│                   │                 │                        │
│    YOUR VIDEO     │  🎭 CELEBRITY   │   OPPONENT VIDEO      │
│   ┌───────────┐   │     FACE        │    ┌───────────┐      │
│   │           │   │  ┌─────────┐    │    │           │      │
│   │   YOU     │   │  │         │    │    │  RIVAL    │      │
│   │  (Live)   │   │  │  DRAKE  │    │    │  (Live)   │      │
│   │           │   │  │   NO    │    │    │           │      │
│   └───────────┘   │  │         │    │    └───────────┘      │
│   🇺🇸 USA         │  └─────────┘    │    🇬🇧 UK             │
│   Score: 7.5      │   MEME          │    Score: 8.2         │
│                   │   Timer: 7s     │                        │
│                   │                 │                        │
├───────────────────┴─────────────────┴───────────────────────┤
│  [🎤 Mute] [Skip Partner]           [💬 Chat Box]           │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 User Flow Diagram

```
        START
          │
          ▼
    ┌──────────┐
    │   Home   │
    │  Screen  │
    └────┬─────┘
         │ Click "Celebrity Face Mimic"
         ▼
    ┌──────────┐      No      ┌──────────┐
    │Logged In?├─────────────►│  Login   │
    └────┬─────┘               │  Modal   │
         │ Yes                 └────┬─────┘
         │                          │
         │◄─────────────────────────┘
         ▼
    ┌──────────┐
    │ Joining  │
    │Matchmaki─┤
    │  ng...   │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │  Match   │
    │  Found!  │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │   3-2-1  │
    │Countdown │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Celebrity│
    │  Face    │◄────┐ 10 second
    │ Appears  │     │  round
    └────┬─────┘     │
         │           │
         ▼           │
    ┌──────────┐     │
    │  Mimic   │     │
    │the Face! │─────┘
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Results  │
    │  Screen  │
    └────┬─────┘
         │
         ├──► Play Again ──┐
         │                 │
         ├──► New Partner ─┤
         │                 │
         └──► Stop ────────┼──► HOME
                           │
                           └──► MATCHMAKING
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         CelebrityDuelArena Component                   │ │
│  │                                                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐      │ │
│  │  │ WebRTC     │  │ Celebrity  │  │ Expression │      │ │
│  │  │ Video      │  │ Face       │  │ Scoring    │      │ │
│  │  │ Streaming  │  │ Display    │  │ (MediaPipe)│      │ │
│  │  └────────────┘  └────────────┘  └────────────┘      │ │
│  │                                                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐      │ │
│  │  │ Chat       │  │ Audio      │  │ Timer      │      │ │
│  │  │ Messages   │  │ Controls   │  │ Countdown  │      │ │
│  │  └────────────┘  └────────────┘  └────────────┘      │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────┬──────────────────────┬────────────────────────┘
               │                      │
               │ WebSocket            │ HTTP/HTTPS
               │ (Socket.io)          │
               ▼                      ▼
┌──────────────────────────────────────────────────────────────┐
│              Signaling Server (Node.js/Express)              │
│  ┌────────────────────┐       ┌──────────────────────────┐  │
│  │  Socket.io Hub     │       │  Celebrity API Routes    │  │
│  │  - Matchmaking     │       │  GET /api/celebrity/*    │  │
│  │  - Room Mgmt       │       │  POST /api/celebrity/*   │  │
│  │  - Score Tracking  │       │                          │  │
│  └────────────────────┘       └──────────────────────────┘  │
└────────────────┬──────────────────────────────────────────────┘
                 │
                 │ SQL Queries
                 ▼
┌──────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                        │
│  ┌────────────────────┐       ┌──────────────────────────┐  │
│  │   users table      │       │  celebrity_faces table   │  │
│  │   - id, username   │       │  - id, name, category    │  │
│  │   - elo, isVIP     │       │  - imageUrl, difficulty  │  │
│  └────────────────────┘       └──────────────────────────┘  │
│  ┌────────────────────┐                                      │
│  │   matches table    │                                      │
│  │   - player scores  │                                      │
│  │   - winner_id      │                                      │
│  └────────────────────┘                                      │
└──────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow Sequence

```
Player A                Signaling Server           Database            Player B
   │                           │                      │                   │
   │  1. Click Celebrity Mode  │                      │                   │
   ├──────────────────────────►│                      │                   │
   │                           │                      │                   │
   │  2. join_celebrity_queue  │                      │                   │
   ├──────────────────────────►│                      │                   │
   │                           │                      │                   │
   │                           │  3. Waiting...       │                   │
   │                           │                      │                   │
   │                           │◄─────────────────────┼───────────────────┤
   │                           │  4. join_celebrity_queue                 │
   │                           │                      │                   │
   │                           │  5. Match Found!     │                   │
   │                           │  SELECT random face  │                   │
   │                           ├─────────────────────►│                   │
   │                           │◄─────────────────────┤                   │
   │                           │  6. Celebrity data   │                   │
   │                           │                      │                   │
   │  7. match_started event   │                      │                   │
   │◄──────────────────────────┤                      │                   │
   │  { celebrityFace data }   │──────────────────────────────────────────►
   │                           │  8. match_started event                  │
   │                           │                      │                   │
   │  9. WebRTC P2P Connection │                      │                   │
   │◄─────────────────────────────────────────────────────────────────────►
   │                           │                      │                   │
   │  10. Video streams flow   │                      │                   │
   │◄═════════════════════════════════════════════════════════════════════►
   │                           │                      │                   │
   │  11. Round plays (10s)    │                      │                   │
   │  - MediaPipe scoring      │                      │                   │
   │                           │                      │                   │
   │  12. submit_score         │                      │                   │
   ├──────────────────────────►│                      │                   │
   │                           │◄─────────────────────┼───────────────────┤
   │                           │  13. submit_score    │                   │
   │                           │                      │                   │
   │                           │  14. Calculate ELO   │                   │
   │                           │  UPDATE users        │                   │
   │                           ├─────────────────────►│                   │
   │                           │                      │                   │
   │  15. match_result         │                      │                   │
   │◄──────────────────────────┤──────────────────────────────────────────►
   │  { winner, scores, elo }  │  16. match_result    │                   │
   │                           │                      │                   │
```

## 🎨 Celebrity Face Categories

```
┌──────────────────────────────────────────────────────────┐
│                   Celebrity Faces                         │
└──────────────────────────────────────────────────────────┘
           │
           ├─────────┬─────────────┬──────────────┐
           ▼         ▼             ▼              ▼
      ┌────────┐ ┌──────────┐ ┌──────────┐  ┌──────────┐
      │ MEMES  │ │CELEBRITY │ │CHARACTER │  │  CUSTOM  │
      └────────┘ └──────────┘ └──────────┘  └──────────┘
           │         │             │              │
           │         │             │              │
      ┌────┴────┐   │        ┌────┴────┐     (VIP Future)
      │         │   │        │         │
   Drake     Success│     Joker    Gandalf
    No       Kid   │      Smile    Wise
                   │
              ┌────┴────┐
              │         │
           Leo      The Rock
         Cheers    Eyebrow
         
         
Difficulty Levels:
─────────────────
🟢 EASY    - Simple expressions (smiles, frowns)
🟡 MEDIUM  - Moderate complexity (smirks, surprised)
🔴 HARD    - Complex expressions (subtle emotions)
```

## 🔧 Component Hierarchy

```
App
└── MediaPipeFaceProvider
    └── AuthProvider
        └── UserProfileProvider
            └── HomeContent
                ├── ModeSelect
                │   ├── Live Face Duel
                │   ├── Solo Emoji Scan
                │   └── Celebrity Face Mimic ★ NEW
                │
                └── CelebrityDuelArena ★ NEW
                    ├── VideoPanel (Me)
                    ├── CelebrityFaceTarget ★ (Center)
                    ├── VideoPanel (Rival)
                    ├── Countdown
                    ├── ChatBox
                    └── ScoreCard
```

## 📱 Responsive Layout

### Desktop (1920x1080)
```
┌──────────────────────────────────────────────┐
│         [Stop]  CELEBRITY MIMIC              │
├──────────────────────────────────────────────┤
│                                              │
│  [Me]      [Celebrity Face]      [Rival]    │
│  Video         Image              Video      │
│  480x360      640x640             480x360    │
│                                              │
└──────────────────────────────────────────────┘
```

### Tablet (768x1024)
```
┌─────────────────────────┐
│   CELEBRITY MIMIC       │
├─────────────────────────┤
│   [Celebrity Face]      │
│       Image             │
│      480x480            │
├─────────────────────────┤
│  [Me]        [Rival]    │
│  Video       Video      │
│  320x240     320x240    │
└─────────────────────────┘
```

### Mobile (375x667)
```
┌───────────────┐
│   CELEBRITY   │
│     MIMIC     │
├───────────────┤
│   [Celeb]     │
│    Face       │
│   320x320     │
├───────────────┤
│    [Me]       │
│   Video       │
│   280x210     │
├───────────────┤
│   [Rival]     │
│   Video       │
│   280x210     │
└───────────────┘
```

## 🎯 Key Differences from Emoji Mode

| Feature              | Emoji Mode      | Celebrity Mode        |
|----------------------|-----------------|-----------------------|
| **Target Display**   | Emoji (😀)      | Celebrity Image       |
| **Theme Color**      | Yellow/Gold     | Pink/Purple           |
| **Target Source**    | Unicode Emoji   | Database + Images     |
| **Scoring**          | Emoji landmarks | Celebrity landmarks   |
| **Badge**            | "Live Match"    | "New Mode"            |
| **API Endpoint**     | /emoji          | /api/celebrity/*      |
| **Queue**            | waitingQueue    | Same (reused)         |

---

This visual guide should help you understand how all the pieces fit together! 🎭
