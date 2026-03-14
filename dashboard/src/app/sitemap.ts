import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://x402guard.dev"

  // Use fixed dates reflecting actual content changes (not request time)
  // Google ignores lastmod when all dates are identical/dynamic
  const lastDeploy = new Date("2026-03-14")
  const launchDate = new Date("2026-03-10")

  return [
    {
      url: baseUrl,
      lastModified: lastDeploy,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: lastDeploy,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: lastDeploy,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/use-cases/elizaos-agent-security`,
      lastModified: launchDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/use-cases/defi-spend-limits`,
      lastModified: launchDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/use-cases/contract-whitelist`,
      lastModified: launchDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/agent`,
      lastModified: lastDeploy,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ]
}
