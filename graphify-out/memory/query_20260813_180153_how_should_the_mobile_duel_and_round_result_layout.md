---
type: "query"
date: "2026-08-13T18:01:53.242666+00:00"
question: "How should the mobile duel and round result layout avoid covering faces and overlapping scores?"
contributor: "graphify"
source_nodes: ["DuelArena", "VideoPanel", "ScoreReveal", "SeamColumn"]
---

# Q: How should the mobile duel and round result layout avoid covering faces and overlapping scores?

## Answer

On mobile, hide the floating Overall Score cards and keep the compact score row outside each camera. Use violet and pink borders around the camera panes for player identity, hide progress bars below the small breakpoint, and show microphone controls only for the local player. During results, keep the center seam idle so ScoreReveal is the single final-score source; render its overlay above the arena with a compact three-column comparison and two 44-pixel action buttons. The near-tie threshold must match the winner threshold so the headline and winner state cannot contradict each other.

## Source Nodes

- DuelArena
- VideoPanel
- ScoreReveal
- SeamColumn