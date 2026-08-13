export const siteConfig = {
  name: "Emoggle",
  alternateNames: ["Emogul", "Omogul", "Emogle", "Emoogle"],
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://emoggle.vercel.app",
  title: "Emoggle: Emoji Face-Matching Webcam Game",
  description:
    "Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed.",
  contentLastModified: "2026-07-19",
};

export const frequentlyAskedQuestions = [
  {
    question: "What is Emoggle?",
    answer:
      "Emoggle is a browser-based emoji face-matching game. It shows players an emoji and scores how closely their facial expression matches it.",
  },
  {
    question: "I searched for Emogul or Omogul. Is this Emoggle?",
    answer:
      "Yes. Emoggle is the official name of this emoji face-matching game. Emogul, Omogul, Emogle, and Emoogle are common search spellings for Emoggle.",
  },
  {
    question: "Is Emoggle free?",
    answer:
      "Emoggle's core solo and random-match gameplay is free to use. Optional premium features may be offered separately.",
  },
  {
    question: "Do I need a webcam?",
    answer:
      "Yes. Live duels and solo expression scoring need access to a working webcam so Emoggle can detect and compare facial expressions.",
  },
  {
    question: "Can I play Emoggle solo?",
    answer:
      "Yes. Solo Emoji Scan lets one player practice emoji expressions and receive an instant score without waiting for another person.",
  },
  {
    question: "How does multiplayer work?",
    answer:
      "Emoggle matches two players online, gives both the same emoji prompt, and compares their expression scores. The closer match wins the round.",
  },
  {
    question: "Does Emoggle store my face?",
    answer:
      "Expression scoring runs in the browser. Live video is sent directly between matched players using a peer-to-peer connection; Emoggle does not use face images to train AI models.",
  },
] as const;
