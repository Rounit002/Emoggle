export const siteConfig = {
  name: "Emoggle",
  alternateNames: ["Emogle", "Emoogle"],
  // Keep every canonical URL and sitemap entry on the verified apex host.
  // A stale deployment environment variable previously emitted vercel.app
  // URLs into the production sitemap, which Search Console rejected.
  url: "https://emoggle.com",
  title: "Emoggle: Emoji Face-Matching Webcam Game",
  description:
    "Match emoji expressions in live webcam duels with strangers or play solo. Emoggle is a free browser face-expression game—no download needed.",
  supportEmail: "rounit7667@gmail.com",
  contentLastModified: "2026-10-29",
};

export const frequentlyAskedQuestions = [
  {
    question: "What is Emoggle?",
    answer:
      "Emoggle is a browser-based emoji face-matching game. It shows players an emoji and scores how closely their facial expression matches it.",
  },
  {
    question: "How do you spell Emoggle?",
    answer:
      "Emoggle is spelled E-M-O-G-G-L-E. It is an emoji face-matching game, not a face-rating or looks-scoring site. Emogle and Emoogle are common misspellings of the name.",
  },
  {
    question: "Is Emoggle free?",
    answer:
      "Yes. Every game mode is free to play. One-time support payments are optional and do not unlock game features.",
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
