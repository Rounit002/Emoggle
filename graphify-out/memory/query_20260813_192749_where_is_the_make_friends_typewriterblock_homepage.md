---
type: "query"
date: "2026-08-13T19:27:49.187523+00:00"
question: "Where is the Make friends TypewriterBlock homepage headline rendered, and which component and class names control its responsive font size and wrapping?"
contributor: "graphify"
source_nodes: ["ModeSelect", "TypewriterBlock"]
---

# Q: Where is the Make friends TypewriterBlock homepage headline rendered, and which component and class names control its responsive font size and wrapping?

## Answer

ModeSelect renders the Make friends. TypewriterBlock inside the homepage H1, while TypewriterBlock in HeadlineMotion controls the character animation. The instance class now uses whitespace-nowrap and a mobile-only 0.82em font size, returning to 1em at the sm breakpoint. This keeps the completed phrase on one line at 320px and 375px without horizontal document overflow while preserving the existing typing animation and desktop size.

## Source Nodes

- ModeSelect
- TypewriterBlock