import { ImageResponse } from "next/og"

export const runtime = "edge"

export const alt = "x402Guard — Spend Limits"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #09090b 0%, #1a1a2e 40%, #16213e 70%, #0f3460 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative gradient orbs */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            left: "-50px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Shield icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "80px",
            height: "80px",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            marginBottom: "24px",
            fontSize: "40px",
          }}
        >
          🛡️
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: "64px",
              fontWeight: 800,
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4)",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-2px",
              display: "flex",
            }}
          >
            Spend Limits
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: 400,
              color: "#a1a1aa",
              maxWidth: "800px",
              textAlign: "center",
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            Prevent AI Agent Budget Overruns
          </div>
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "40px",
          }}
        >
          {["Per-Transaction", "Daily Cap", "Atomic Check", "Auto Reset"].map(
            (feature) => (
              <div
                key={feature}
                style={{
                  display: "flex",
                  padding: "10px 20px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#e4e4e7",
                  fontSize: "16px",
                  fontWeight: 500,
                }}
              >
                {feature}
              </div>
            )
          )}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            display: "flex",
            alignItems: "center",
            gap: "24px",
            color: "#71717a",
            fontSize: "16px",
          }}
        >
          <span style={{ display: "flex" }}>Open Source</span>
          <span style={{ display: "flex", color: "#3b82f6" }}>·</span>
          <span style={{ display: "flex" }}>Non-Custodial</span>
          <span style={{ display: "flex", color: "#8b5cf6" }}>·</span>
          <span style={{ display: "flex" }}>Base + Solana</span>
          <span style={{ display: "flex", color: "#06b6d4" }}>·</span>
          <span style={{ display: "flex" }}>x402guard.dev</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
