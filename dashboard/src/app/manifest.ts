import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "x402Guard — AI Agent Security for DeFi",
    short_name: "x402Guard",
    description:
      "Non-custodial security proxy enforcing spend limits, contract whitelists, and session keys on AI agent DeFi payments.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
