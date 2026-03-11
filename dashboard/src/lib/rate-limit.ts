import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// Lazy-initialized rate limiter — avoids build-time crash when env vars are missing
let _ratelimit: Ratelimit | null = null

function getRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      // 5 requests per 60 seconds per IP — tight for auth endpoints
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'x402guard:auth',
    })
  }
  return _ratelimit
}

/**
 * Check rate limit by IP. Returns null if allowed, or a 429 Response if blocked.
 * Gracefully degrades (allows request) if Upstash is not configured.
 */
export async function checkAuthRateLimit(
  req: NextRequest,
  endpoint: string,
): Promise<NextResponse | null> {
  const limiter = getRatelimit()
  if (!limiter) {
    // No rate limiting configured — fail open in dev, log warning in prod
    if (process.env.NODE_ENV === 'production') {
      console.warn('Rate limiting not configured — UPSTASH_REDIS_REST_URL/TOKEN missing')
    }
    return null
  }

  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  const identifier = `${endpoint}:${ip}`

  try {
    const { success, remaining, reset } = await limiter.limit(identifier)

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Remaining': '0',
          },
        },
      )
    }

    // Allowed — caller will set headers on their own response if needed
    return null
  } catch (err) {
    // Redis error — fail open (don't block legitimate users)
    console.error('Rate limit check failed', { endpoint, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
