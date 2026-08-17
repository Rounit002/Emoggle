---
type: "query"
date: "2026-08-13T19:13:20.204361+00:00"
question: "Which homepage component renders the two-player hero face-off preview with Round 03, timers, Target emoji, center divider, Violet and Pink cards, and score bars?"
contributor: "graphify"
source_nodes: ["HeroPreview", "PreviewColumn"]
---

# Q: Which homepage component renders the two-player hero face-off preview with Round 03, timers, Target emoji, center divider, Violet and Pink cards, and score bars?

## Answer

HeroPreview in frontend/app/components/ModeSelect.tsx renders the landing-page face-off, while PreviewColumn renders each player card. The decorative middle divider was removed; TARGET is pinned to the top of the center column and the emoji remains centered below it. The single global and center timer labels were removed, and PreviewColumn now receives a time prop so each Violet and Pink image displays its own 10s badge at the top-right. Score bars and the Round 03 pill remain unchanged.

## Source Nodes

- HeroPreview
- PreviewColumn