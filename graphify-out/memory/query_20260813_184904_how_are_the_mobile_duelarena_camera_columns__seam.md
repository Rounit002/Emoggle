---
type: "query"
date: "2026-08-13T18:49:04.656965+00:00"
question: "How are the mobile DuelArena camera columns, Seam emoji, VideoPanel score and ELO overlays, and ChatBox arranged, and which components control their responsive layout?"
contributor: "graphify"
source_nodes: ["DuelArena", "DuelColumn", "SeamColumn", "VideoPanel", "Seam", "ChatBox"]
---

# Q: How are the mobile DuelArena camera columns, Seam emoji, VideoPanel score and ELO overlays, and ChatBox arranged, and which components control their responsive layout?

## Answer

DuelArena now uses a mobile-only three-row grid: an inset 4:3 violet camera card, a dedicated 72px Seam emoji row, and an inset 4:3 pink camera card. Each DuelColumn places one compact score at the camera bottom-left and the local 44px microphone control bottom-right; the desktop score controls remain hidden until the sm breakpoint. VideoPanel keeps the ELO/rank at top-right and hides its redundant bottom identity badge only for full-bleed duel panels on mobile. Seam removes its divider, target label, timer, and change control on mobile while preserving them at sm and above. ChatBox receives compactOnMobile, defaults to a 72px dock, and expands into a usable bottom sheet; desktop remains a 300px panel. These responsive changes are controlled by DuelArena, DuelColumn, SeamColumn, VideoPanel, Seam, and ChatBox.

## Source Nodes

- DuelArena
- DuelColumn
- SeamColumn
- VideoPanel
- Seam
- ChatBox