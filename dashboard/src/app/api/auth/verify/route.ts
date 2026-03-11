import { NextRequest, NextResponse } from 'next/server'
import { SiweMessage } from 'siwe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { checkAuthRateLimit } from '@/lib/rate-limit'

const ALLOWED_CHAIN_IDS = [8453, 84532] // Base Mainnet, Base Sepolia

// Lazy-initialized admin client — avoids build-time error when env vars are missing
let _adminClient: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 requests per 60s per IP
    const blocked = await checkAuthRateLimit(req, 'verify')
    if (blocked) return blocked

    // CSRF: verify request originates from our own domain
    const origin = req.headers.get('origin')
    const host = req.headers.get('host')
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 },
      )
    }

    // Validate SUPABASE_WALLET_SECRET is configured
    if (!process.env.SUPABASE_WALLET_SECRET) {
      console.error('SIWE verify: SUPABASE_WALLET_SECRET not configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    const { message, signature } = await req.json()

    // 1. Read nonce from httpOnly cookie
    const nonce = req.cookies.get('siwe-nonce')?.value
    if (!nonce) {
      return NextResponse.json(
        { error: 'No nonce found. Request a new nonce first.' },
        { status: 400 },
      )
    }

    // 2. Reconstruct and verify SIWE message
    const siweMessage = new SiweMessage(message)
    const result = await siweMessage.verify({ signature, nonce })

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 },
      )
    }

    // 3. Validate chain ID
    const chainId = result.data.chainId
    if (!ALLOWED_CHAIN_IDS.includes(chainId)) {
      return NextResponse.json(
        { error: `Chain ${chainId} not allowed. Use Base (8453) or Base Sepolia (84532).` },
        { status: 403 },
      )
    }

    // 4. Create or retrieve Supabase user
    const walletAddress = result.data.address.toLowerCase()
    const pseudoEmail = `${walletAddress}@wallet.x402guard.local`
    // HMAC-SHA256 produces a 64-char hex string (under bcrypt's 72-byte limit).
    // The raw concatenation was 107 chars which caused Supabase 500 errors.
    const deterministicPassword = createHmac('sha256', process.env.SUPABASE_WALLET_SECRET!)
      .update(walletAddress)
      .digest('hex')

    // Try sign-in first
    const { data: signInData, error: signInError } =
      await getSupabaseAdmin().auth.signInWithPassword({
        email: pseudoEmail,
        password: deterministicPassword,
      })

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        // User does not exist — create via admin API
        const { error: createError } =
          await getSupabaseAdmin().auth.admin.createUser({
            email: pseudoEmail,
            password: deterministicPassword,
            email_confirm: true, // Auto-confirm — no email verification needed
            user_metadata: { wallet_address: walletAddress },
          })

        if (createError) {
          console.error('SIWE: failed to create user', { wallet: walletAddress, error: createError.message })
          return NextResponse.json(
            { error: 'Failed to create user account' },
            { status: 500 },
          )
        }

        // Sign in the newly created user
        const { data: newSignIn, error: newSignInError } =
          await getSupabaseAdmin().auth.signInWithPassword({
            email: pseudoEmail,
            password: deterministicPassword,
          })

        if (newSignInError || !newSignIn.session) {
          console.error('SIWE: failed to sign in new user', { wallet: walletAddress, error: newSignInError?.message })
          return NextResponse.json(
            { error: 'Failed to create session' },
            { status: 500 },
          )
        }

        // Clear nonce cookie (single-use)
        const response = NextResponse.json({ session: newSignIn.session })
        response.cookies.set('siwe-nonce', '', { maxAge: 0, path: '/' })
        return response
      }

      // Unexpected sign-in error
      console.error('SIWE: unexpected sign-in error', { wallet: walletAddress, error: signInError.message })
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 },
      )
    }

    if (!signInData.session) {
      return NextResponse.json(
        { error: 'No session returned' },
        { status: 500 },
      )
    }

    // 5. Clear nonce cookie and return session
    const response = NextResponse.json({ session: signInData.session })
    response.cookies.set('siwe-nonce', '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    console.error('SIWE: verification error', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 401 },
    )
  }
}
