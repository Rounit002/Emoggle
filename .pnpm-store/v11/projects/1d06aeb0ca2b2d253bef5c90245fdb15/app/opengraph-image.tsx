import { ImageResponse } from "next/og";

export const alt = "Emoggle emoji face-matching webcam game";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 50% 0%, #5b21b6 0%, #17172a 42%, #0b0c14 78%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "#c4b5fd",
            display: "flex",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          Emoji face-matching game
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 132,
            fontWeight: 900,
            letterSpacing: -7,
            lineHeight: 1,
            marginTop: 24,
            textTransform: "uppercase",
          }}
        >
          Emoggle
        </div>
        <div
          style={{
            color: "#d4d4d8",
            display: "flex",
            fontSize: 34,
            marginTop: 30,
          }}
        >
          Match the emoji. Beat the expression.
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 48,
          }}
        >
          {["LIVE DUELS", "SOLO MODE", "NO DOWNLOAD"].map((label) => (
            <div
              key={label}
              style={{
                border: "2px solid rgba(196, 181, 253, 0.45)",
                borderRadius: 999,
                color: "#ede9fe",
                display: "flex",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: 2,
                padding: "14px 24px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

