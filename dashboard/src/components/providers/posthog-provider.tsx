'use client'

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"

/**
 * Tracks SPA-style page views on route changes.
 * Must be wrapped in Suspense because useSearchParams() suspends during SSR.
 */
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname
      if (searchParams?.toString()) {
        url = url + "?" + searchParams.toString()
      }
      posthog.capture("$pageview", { $current_url: url })
    }
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      // Route through our own domain to bypass ad blockers (see next.config.ts rewrites)
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      // Manual pageview tracking via PostHogPageView component
      capture_pageview: false,
      // Track page leaves for bounce rate analytics
      capture_pageleave: true,
      // Respect Do Not Track browser setting
      respect_dnt: true,
      // Disable in development
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") ph.debug()
      },
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}
