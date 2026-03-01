import { NextResponse } from 'next/server'
import { generateNonce } from 'siwe'

export async function GET() {
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
