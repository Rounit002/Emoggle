// Session creation and matchmaking must always target the same service.
// A fresh local checkout works without a configured public backend URL.
export const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL?.trim().replace(/\/+$/, "") ||
  "http://localhost:3001";
