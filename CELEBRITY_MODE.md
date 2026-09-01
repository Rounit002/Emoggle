# Celebrity Face Mimic Mode

A real-time 1v1 mode where two strangers are matched and both try
to imitate the same celebrity's facial expression. The player
whose expression is closest to the celebrity's target wins the
round.

This document covers the design, the file layout, the data flow,
and how to add / tune celebrity rows.

## What changed in the existing architecture

Nothing was rebuilt. The mode is layered on top of the existing
matchmaking, WebRTC, MediaPipe, scoring, and result / share
plumbing:

| Layer | Existing | Celebrity addition |
|-------|----------|---------------------|
| Schema (`db.js`) | `users`, `sessions`, `matches`, `celebrity_faces`, `moderation_reports` | `matches.game_mode` (`'emoji'` \| `'celebrity'`), `matches.celebrity_id`, `matches.celebrity_name`, `celebrity_faces.expression_profile` |
| Signaling server (`index.js`) | `join_queue` / `submit_score` / `match_result` flow | Parallel `celebrity_join_queue` flow, `celebrity_match_started`, `celebrity_countdown_tick`, `celebrity_match_result` events, dedicated `celebrityWaitingQueue`, `startCelebrityMatch`, `pickCelebrity` |
| WebRTC / PeerJS | `useMatchmaking` hook | Reused as-is — celebrity mode uses the same socket + Peer transport via `useCelebrityMatchmaking` |
| MediaPipe | `useMediaPipeFace` + `useExpressionScorer` (emoji-table) | New `useCelebrityExpressionScorer` that runs the same face-mesh pipeline but scores against the celebrity target profile |
| Scoring | Emoji-table matching in `useExpressionScorer` | New `lib/celebrityScoring.ts` — pure-math feature comparison (mouth open, smile, eye, brow, lip pucker) normalized to face scale, with peak-based aggregation |
| Result UI | `result/ResultScreen.tsx` | New `CelebrityResultScreen.tsx` (mode-themed copy + celebrity share card) + `result/CelebrityShareScoreCard.tsx` |
| Game-mode selector | `ChooseGameMode.tsx` (no changes — already routes to celebrity) | n/a |

The mode is opt-in. The existing emoji duel and every existing
socket event stays untouched.

## Round lifecycle

1. User picks **Celebrity Face** in the mode selector.
2. Client emits `celebrity_join_queue` with the same peer + identity
   payload the emoji queue expects. Server adds the socket to
   `celebrityWaitingQueue`.
3. As soon as two compatible players are waiting, the server:
   - Picks a celebrity via `pickCelebrity` (least-used first, random
     within the same usage bucket).
   - Creates a `matches` row with `game_mode='celebrity'` and the
     celebrity id/name.
   - Emits `celebrity_match_started` to both clients with the
     **same** `matchId` and **same** `celebrity` payload (id, name,
     category, imageUrl, difficulty, optional `expressionProfile`).
4. Server runs the same 3-second countdown as the emoji duel,
   broadcasting `celebrity_countdown_tick`.
5. Countdown reaches 0 → server marks the round open, starts the
   10s scan window, fires `emoji_locked` (the event name is
   reused for both modes so the existing client gate works).
6. Each client computes a **peak** mimicry score locally from its
   own webcam feed and posts it via `submit_score`. The server
   trusts the submitted value (no extra averaging — peak is
   authoritative for celebrity mode), validates window + dedup,
   and waits for both submissions.
7. Server calls `finalizeMatchScores` which:
   - Marks the match COMPLETED.
   - Skips ELO updates (default; opt-in via
     `CELEBRITY_AFFECTS_ELO=true`).
   - Increments `celebrity_faces.usage_count` for the chosen
     celebrity.
8. Server emits `celebrity_match_result` to both clients with
   the player-relative outcome plus the celebrity `{id, name}`.
9. Both clients render `CelebrityResultScreen`, which mounts an
   off-screen `CelebrityShareScoreCard` for the share flow.

## Scoring algorithm

The scoring is 100% local, 100% deterministic, and never calls an
external API. The flow per frame:

1. `useCelebrityExpressionScorer` runs MediaPipe Face Landmarker
   on the local `<video>` element.
2. Frames with no face, multiple faces, missing critical
   landmarks, or coordinates clustered at the origin are dropped
   via `isScoreableFrame`.
3. For every valid frame, `extractLiveMetrics` reduces the 478
   landmarks to 9 normalized 0..1 axes (mouth open / width /
   smile / frown, eye open / squint, brow raise / drop, lip
   pucker). All measurements are divided by the player's own
   face scale (temple-to-temple) so different face shapes,
   distances, and genders don't skew the score.
4. `scoreCelebrityFrame` compares each live axis against the
   target profile, applies per-axis weights, and returns a number
   in [0, 10].
5. The arena keeps a `PeakScoreAccumulator`. Every valid frame
   the running peak is updated. The final submitted score is the
   **best** sample the player produced — never a mean of "good"
   and "bad" moments.

### Target profiles

Every celebrity row should ideally carry a hand-curated
`expression_profile` JSONB column with the same 9 keys above. The
schema and the seed script include a curated profile for every
default row.

If a row has no `expression_profile`, the resolver falls back to
a deterministic default keyed by `category × difficulty`
(`CELEBRITY_DEFAULT_PROFILES` in `celebrityScoring.ts`). This
guarantees every celebrity in the catalogue is playable even
before a human tunes it.

If a row also has pre-computed `facial_landmarks` (a full
478-point array), the same row's landmarks are run through
`extractLiveMetrics` and the result is used as the target — so
an out-of-band "we already have a face mesh for this celebrity"
workflow drops in cleanly.

## Adding a new celebrity

1. Drop the image under `frontend/public/celebrity-faces/<category>/<slug>.jpg` (or
   any CDN URL — `image_url` is a free-form TEXT field).
2. Insert the row:
   ```sql
   INSERT INTO celebrity_faces
     (name, category, image_url, difficulty, expression_profile)
   VALUES
     ('The Name', 'celebrity', '/celebrity-faces/celebrities/the-name.jpg', 'medium',
      '{"mouthOpen":0.0,"mouthWidth":0.4,"mouthSmile":0.5,"mouthFrown":0.0,
        "eyeOpen":0.5,"eyeSquint":0.0,"browRaise":0.3,"browDown":0.0,
        "lipPucker":0.0}'::jsonb);
   ```
3. Or run the seed script and then `UPDATE` the row with the
   tuned profile.

All values are 0..1. Mouth / eye / brow geometry is calibrated
against the MediaPipe Face Mesh landmarks listed in
`celebrityScoring.ts`.

## Tests

Two test layers are wired up:

- `frontend/app/lib/celebrityScoring.test.ts` — pure-math unit
  checks. Run with:
  ```
  cd frontend
  npx tsx app/lib/celebrityScoring.test.ts
  ```
- `signaling-server/test/celebrity.test.js` — end-to-end smoke
  test that boots the server, opens two real socket.io clients,
  walks through the full match, and verifies the DB row +
  usage_count delta. Requires `DATABASE_URL` to be configured.
  Run with:
  ```
  cd signaling-server
  node test/celebrity.test.js
  ```

## Configuration

- `CELEBRITY_AFFECTS_ELO=true` — opt the celebrity mode into
  ranked ELO changes. Default: `false`. When false, the
  `finalizeMatchScores` path uses an "unranked" payload (no
  delta, no tier promotion), so the existing ELO system stays
  untouched.

The mode also respects the same env knobs the emoji duel does:
`RANKED_ELO_ENABLED`, `TRUST_GEO_HEADERS`, `ENABLE_RANKED_ELO`,
etc.

## Error & edge handling

- **Camera denied**: `getUserMedia` falls back to video-only
  then to a console error. The celebrity arena shows no webcam
  frame; scoring simply yields 0.
- **MediaPipe fails to load**: `useCelebrityExpressionScorer`
  reports `status: "error"`; the peak accumulator stays empty
  and the final submitted score is 0. The result still
  finalizes so the partner isn't stuck on a spinner.
- **No face in frame**: dropped at the sampler. The peak is
  whatever the player achieved before losing the face; if the
  player never locked onto a face, the peak is 0.
- **Multiple faces**: same — the scorer sees more than one
  `faceLandmarks` array and drops the frame.
- **Opponent disconnects mid-round**: server marks the match
  DISCONNECTED, the remaining client gets `opponent_left`, the
  server's deadline-fallback timer (10s + 3s grace) calls
  `finalizeMatchResult({ fillMissing: true })` so the round
  still resolves.
- **Duplicate score submissions**: server-side
  `Object.hasOwn(match.scores, socket.id)` guard rejects the
  second submit silently.
- **Celebrity image fails to load**: the front-end falls back to
  a trophy emoji tile so the round stays playable.
- **No celebrity rows in the database**: the matchmaking path
  emits `server_error` to both clients and aborts the match
  cleanly.
- **Database unavailable**: matchmaking continues in-memory per
  the existing fallback; the round finalizes without persisting
  the match.
