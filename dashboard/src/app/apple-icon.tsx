import { ImageResponse } from "next/og"

export const runtime = "edge"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #1a1a2e 50%, #0f3460 100%)",
          borderRadius: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "120px",
            height: "120px",
            borderRadius: "28px",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            fontSize: "64px",
          }}
        >
          🛡️
        </div>
      </div>
    ),
    { ...size }
  )
}
