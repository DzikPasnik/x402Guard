import { NextRequest, NextResponse } from 'next/server'
import { generateNonce } from 'siwe'
import { checkAuthRateLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const blocked = await checkAuthRateLimit(req, 'nonce')
  if (blocked) return blocked

  const nonce = generateNonce()

  const response = NextResponse.json({ nonce })

  // Store nonce in httpOnly cookie — client cannot read or tamper
  response.cookies.set('siwe-nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 300, // 5 minutes — nonce expires after this
    path: '/',
  })

  return response
}
