# Phase 4: Dashboard - Wallet Authentication Research

**Researched:** 2026-03-01
**Domain:** Ethereum wallet authentication (SIWE + RainbowKit + wagmi v2 + Supabase Auth)
**Confidence:** MEDIUM — based on training knowledge (cutoff August 2025). Web verification blocked during this session. All package versions MUST be confirmed against npm before installation.

---

## Summary

Wallet-based authentication for x402Guard Dashboard requires connecting three systems:

1. **Wallet connection layer** — RainbowKit (ConnectButton UI) + wagmi v2 (React hooks) + viem (EVM primitives)
2. **Authentication handshake** — Sign-In with Ethereum (SIWE / EIP-4361): wallet signs a nonce message, backend verifies the signature
3. **Session management** — Supabase Auth receives a signed proof and issues a JWT session; subsequent requests include the Supabase token

The full flow is: user clicks "Connect Wallet" → RainbowKit shows wallet picker → wallet connects → user clicks "Sign In" → wallet signs EIP-4361 message → Next.js API route verifies signature → Supabase Auth creates session → subsequent requests carry Supabase cookie.

There is NO first-party Supabase SIWE adapter (as of August 2025). The standard approach uses Supabase's `signInWithPassword` with a deterministically-derived password from the wallet signature, or the `supabase.auth.admin.createUser` + custom JWT flow. The recommended production pattern is the **custom JWT approach** using Supabase's `jwt_secret` verification.

**Primary recommendation:** RainbowKit 2.x + wagmi 2.x + viem 2.x + siwe + a Next.js API route that calls `supabase.auth.signInWithPassword` with a wallet-derived credential. This is the most widely-adopted pattern with the best documentation coverage.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @rainbow-me/rainbowkit | ^2.2.x | Wallet picker UI + ConnectButton | Industry standard; supports 300+ wallets; built on wagmi |
| wagmi | ^2.14.x | React hooks for EVM (useAccount, useSignMessage, useChainId) | Official wagmi v2; pairs with viem 2.x; App Router compatible |
| viem | ^2.21.x | Low-level EVM utilities (address, hash, signature) | Replaces ethers.js; wagmi v2 peer dep |
| @tanstack/react-query | ^5.x | Async state for wagmi hooks | Required wagmi v2 peer dep |
| siwe | ^2.3.x | EIP-4361 message construction + server-side verification | Standard SIWE reference impl |
| @supabase/supabase-js | ^2.97.0 | Supabase client (already installed) | Already in project |
| @supabase/ssr | ^0.5.x | Server-side Supabase client for Next.js App Router | Replaces @supabase/auth-helpers-nextjs |

> CAUTION: Verify exact versions on npm before installing. wagmi 2.x had breaking changes from 1.x. The wagmi team releases frequently.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @rainbow-me/rainbowkit-siwe-next-auth | avoid | SIWE adapter for NextAuth | Not applicable — project uses Supabase, not NextAuth |
| iron-session | ^8.x | Alternative server-side session store | Only needed if Supabase session approach is not used |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RainbowKit | ConnectKit (family.co) | ConnectKit is lighter; less wallet support; harder to customize |
| RainbowKit | Dynamic.xyz | Dynamic supports multi-chain incl. Solana; SDK is heavier; commercial |
| RainbowKit | viem + custom modal | Maximum control; significant UI work; not worth it unless bundle size is critical |
| wagmi + RainbowKit | ethers.js + Web3Modal | Web3Modal v3 is walletconnect's product; wagmi is now the community standard |
| siwe | manual sig verify | siwe handles nonce, domain, expiry, chain ID; don't hand-roll |
| Supabase custom JWT | NextAuth + CredentialsProvider | NextAuth adds complexity; project already has Supabase; keep single auth system |

**Installation:**
```bash
npm install @rainbow-me/rainbowkit wagmi viem @tanstack/react-query siwe @supabase/ssr
```

---

## Architecture Patterns

### Recommended Project Structure
```
dashboard/src/
├── app/
│   ├── layout.tsx              # Root layout — Providers wrap here
│   ├── page.tsx                # Home / landing
│   ├── dashboard/
│   │   ├── layout.tsx          # Protected layout — checks Supabase session
│   │   └── page.tsx            # Dashboard home
│   └── api/
│       └── auth/
│           ├── nonce/
│           │   └── route.ts    # GET  — generate + store nonce
│           └── verify/
│               └── route.ts    # POST — verify SIWE signature, create Supabase session
├── components/
│   ├── providers/
│   │   ├── wagmi-provider.tsx  # 'use client' — WagmiProvider + QueryClient
│   │   └── auth-provider.tsx   # 'use client' — Supabase session context
│   └── auth/
│       ├── connect-button.tsx  # Wraps RainbowKit ConnectButton + SIWE trigger
│       └── sign-in-button.tsx  # "Sign In with Ethereum" step
├── lib/
│   ├── supabase.ts             # Browser client (already exists)
│   ├── supabase-server.ts      # Server client using @supabase/ssr
│   ├── siwe.ts                 # SIWE message builder helpers
│   └── wagmi-config.ts         # wagmi createConfig — chains, transports, connectors
└── middleware.ts               # Supabase session refresh + route protection
```

### Pattern 1: WagmiProvider + QueryClientProvider (Client Component)

**What:** wagmi 2.x requires WagmiProvider and a TanStack QueryClient. These are client-side only. In Next.js App Router, wrap them in a `'use client'` component and place it in the root layout.

**When to use:** Always — these wrap the entire app tree.

```typescript
// dashboard/src/components/providers/wagmi-provider.tsx
'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, baseSepolia, mainnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

// Source: RainbowKit docs — getDefaultConfig is the v2 recommended approach
const config = getDefaultConfig({
  appName: 'x402Guard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [base, baseSepolia],
  ssr: true, // Required for Next.js App Router
})

export function Web3Providers({ children }: { children: React.ReactNode }) {
  // QueryClient must be created inside component to avoid shared state between requests
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

```typescript
// dashboard/src/app/layout.tsx — updated
import { Web3Providers } from '@/components/providers/wagmi-provider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Providers>
          {children}
        </Web3Providers>
      </body>
    </html>
  )
}
```

> IMPORTANT: `getDefaultConfig` requires a WalletConnect `projectId`. Register at https://cloud.walletconnect.com — free tier available.

### Pattern 2: SIWE Authentication Flow

**What:** Two-step handshake — connect wallet, then sign a domain-specific nonce.

**When to use:** Every login. Step 1 (wallet connect) is optional skip if already connected.

```
Step 1: GET /api/auth/nonce
  → Server generates random nonce, stores in server-side session or Redis
  → Returns { nonce }

Step 2: Client builds EIP-4361 message using siwe.SiweMessage
Step 3: Client signs message with wallet (useSignMessage hook)
Step 4: POST /api/auth/verify { message, signature }
  → Server reconstructs SiweMessage, calls .verify({ signature })
  → If valid: creates/fetches Supabase user, returns session tokens
Step 5: Client stores Supabase session (supabase.auth.setSession)
```

```typescript
// dashboard/src/app/api/auth/nonce/route.ts
import { NextResponse } from 'next/server'
import { generateNonce } from 'siwe'

// In production: store nonce in Redis or signed cookie to prevent replay
export async function GET() {
  const nonce = generateNonce()
  const response = NextResponse.json({ nonce })
  // Store nonce in httpOnly cookie for server-side verification
  response.cookies.set('siwe-nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 300, // 5 minutes
  })
  return response
}
```

```typescript
// dashboard/src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { SiweMessage } from 'siwe'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-only, never expose to client
)

export async function POST(req: NextRequest) {
  const { message, signature } = await req.json()
  const nonce = req.cookies.get('siwe-nonce')?.value

  if (!nonce) {
    return NextResponse.json({ error: 'No nonce found' }, { status: 400 })
  }

  const siweMessage = new SiweMessage(message)

  try {
    const result = await siweMessage.verify({ signature, nonce })

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const walletAddress = result.data.address.toLowerCase()

    // Create or retrieve user keyed by wallet address (use email field as wallet ID)
    // Pattern: use wallet address as pseudo-email since Supabase requires email
    const pseudoEmail = `${walletAddress}@wallet.x402guard.local`
    const deterministicPassword = `${process.env.SUPABASE_WALLET_SECRET}:${walletAddress}`

    let userId: string

    // Try to sign in first; create user if not found
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: pseudoEmail,
      password: deterministicPassword,
    })

    if (signInError && signInError.message.includes('Invalid login credentials')) {
      // User does not exist — create
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: pseudoEmail,
        password: deterministicPassword,
        email_confirm: true,
        user_metadata: { wallet_address: walletAddress },
      })
      if (createError) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      userId = createData.user.id

      // Sign in the newly created user to get session
      const { data: newSession } = await supabaseAdmin.auth.signInWithPassword({
        email: pseudoEmail,
        password: deterministicPassword,
      })
      return NextResponse.json({ session: newSession?.session })
    }

    return NextResponse.json({ session: signInData?.session })

  } catch (err) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 401 })
  }
}
```

> SECURITY NOTE: `deterministicPassword` approach has a subtle vulnerability: if `SUPABASE_WALLET_SECRET` leaks, any wallet address can be impersonated without a real signature. Store this secret carefully. The signature verification in the API route is the real security gate.

### Pattern 3: Client-side SIWE trigger hook

```typescript
// dashboard/src/hooks/use-siwe-auth.ts
'use client'

import { useSignMessage, useAccount } from 'wagmi'
import { SiweMessage } from 'siwe'
import { useSupabaseClient } from '@/lib/supabase'
import { useState } from 'react'

export function useSiweAuth() {
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const supabase = useSupabaseClient()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    if (!address || !chainId) return
    setIsSigningIn(true)
    setError(null)

    try {
      // Step 1: Fetch nonce
      const nonceRes = await fetch('/api/auth/nonce')
      const { nonce } = await nonceRes.json()

      // Step 2: Build SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to x402Guard. This request will not trigger any blockchain transaction.',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
      })
      const preparedMessage = message.prepareMessage()

      // Step 3: Sign with wallet
      const signature = await signMessageAsync({ message: preparedMessage })

      // Step 4: Verify on server
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      })
      const { session, error: verifyError } = await verifyRes.json()

      if (verifyError) throw new Error(verifyError)

      // Step 5: Set Supabase session in browser
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setIsSigningIn(false)
    }
  }

  return { signIn, isSigningIn, error }
}
```

### Pattern 4: Protected Routes with Next.js Middleware

**What:** Supabase session cookie checked on every request via Next.js middleware.

**When to use:** All `/dashboard/*` routes.

```typescript
// dashboard/src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: object) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: object) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  // Protect /dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
```

### Pattern 5: Logout (wallet disconnect + Supabase signOut)

```typescript
// dashboard/src/hooks/use-sign-out.ts
'use client'

import { useDisconnect } from 'wagmi'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useSignOut() {
  const { disconnect } = useDisconnect()
  const router = useRouter()

  async function signOut() {
    // 1. Sign out from Supabase (clears session cookie)
    await supabase.auth.signOut()
    // 2. Disconnect wallet from wagmi state
    disconnect()
    // 3. Redirect to landing
    router.push('/')
  }

  return { signOut }
}
```

### Anti-Patterns to Avoid

- **Storing SIWE nonce only in memory:** A stateless nonce (e.g., in cookie only) is acceptable for simple cases, but a replay attack is possible if the same nonce is reused. Use a server-side store (Redis) or sign the nonce with a server secret.
- **Exposing `SUPABASE_SERVICE_ROLE_KEY` in client code:** This key bypasses Row Level Security. It must ONLY appear in server-side API routes.
- **Using `export const config = { api: { bodyParser: false } }` pattern:** This is Pages Router style. App Router API routes (route.ts) parse JSON differently — use `await req.json()`.
- **Calling `supabase.auth.getSession()` on the server without `@supabase/ssr`:** The browser client (`@supabase/supabase-js` createClient) does not forward cookies server-side. Use `createServerClient` from `@supabase/ssr` in server components and middleware.
- **Skipping the `ssr: true` option in wagmi's `getDefaultConfig`:** Without this, server-side rendering throws hydration errors because wallet state is not available on the server.
- **Using `ConnectButton` without the stylesheet import:** RainbowKit styles must be imported once: `import '@rainbow-me/rainbowkit/styles.css'` — best in the root layout or the Providers component.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EIP-4361 message construction | Custom string template | `siwe.SiweMessage` | SIWE spec has 12+ required fields; version, nonce, expiry, chain ID all affect security |
| SIWE message verification | Manual ecrecover | `siweMessage.verify({ signature })` | Handles address checksum normalization, nonce validation, expiry check, domain binding |
| Wallet picker UI | Custom modal + MetaMask detection | RainbowKit `ConnectButton` | Handles 300+ wallets, WalletConnect, mobile deep links, reconnection |
| Signature verification (EVM) | Web3.js eth.accounts.recover | viem `verifyMessage` | viem is wagmi's native primitive; no extra dependency |
| Session cookie management | Manual cookie set/delete | `@supabase/ssr` createServerClient | Supabase SSR handles cookie refresh, expiry, and SameSite correctly |
| Protected route guard | Custom HOC | Next.js middleware + supabase session check | Middleware runs at Edge before page renders; no flash of protected content |

**Key insight:** The SIWE spec (EIP-4361) looks simple but has many edge cases: nonce reuse, clock skew in expiry, address checksum, domain phishing attacks. The `siwe` library handles all of them — always use it on both client and server.

---

## Common Pitfalls

### Pitfall 1: Hydration Mismatch with wagmi + SSR

**What goes wrong:** The wallet connection state (address, chainId) is `undefined` on the server and truthy on the client, causing React hydration errors.

**Why it happens:** wagmi reads from localStorage/injected providers which are only available in the browser.

**How to avoid:**
- Set `ssr: true` in `getDefaultConfig`
- Use `useEffect` or the `mounted` pattern before rendering wallet-dependent UI
- Never read `address` in a Server Component — do it only in Client Components

**Warning signs:** `Error: Hydration failed because the initial UI does not match what was rendered on the server`

```typescript
// Safe pattern for wallet-dependent display
'use client'
import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'

function WalletAddress() {
  const { address } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null // Prevent SSR mismatch
  return <span>{address ?? 'Not connected'}</span>
}
```

### Pitfall 2: WalletConnect ProjectId Missing

**What goes wrong:** `@walletconnect/core` throws an error on load: `No projectId provided`

**Why it happens:** RainbowKit v2 requires WalletConnect Cloud project ID for all connector types (not just WalletConnect mobile).

**How to avoid:** Register at https://cloud.walletconnect.com before any testing. Add to `.env.local`:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

**Warning signs:** Runtime error before ConnectButton renders.

### Pitfall 3: Supabase `@supabase/ssr` vs `@supabase/auth-helpers-nextjs`

**What goes wrong:** Using the old `@supabase/auth-helpers-nextjs` package which was deprecated and replaced by `@supabase/ssr`.

**Why it happens:** Many blog posts and tutorials still reference the old package.

**How to avoid:** Use `@supabase/ssr` exclusively. The middleware pattern changes significantly between the two.

**Warning signs:** `createMiddlewareClient is not a function` — this is the old API.

### Pitfall 4: SIWE Message Domain Mismatch

**What goes wrong:** `siweMessage.verify()` throws `Domain does not match`. Verification fails in production.

**Why it happens:** The `domain` field in the SIWE message is set from `window.location.host` (e.g., `localhost:3000`) but in production it becomes `app.x402guard.io` without the port. The server sees a mismatch.

**How to avoid:** Set domain in the SIWE message to match the exact host the API route runs on. Do not rely on default — always explicitly pass `domain: window.location.host`.

**Warning signs:** Works locally, fails in production/staging.

### Pitfall 5: Nonce Replay After Page Refresh

**What goes wrong:** User fetches a nonce, doesn't complete sign-in, refreshes, re-uses the old nonce cookie value.

**Why it happens:** Nonce stored in httpOnly cookie survives page refresh.

**How to avoid:** After successful SIWE verification, clear the nonce cookie immediately. On the server, reject any nonce that has already been used. In production, use Redis with TTL for nonce tracking.

### Pitfall 6: `supabase.auth.getSession()` Returns Stale Data on Server

**What goes wrong:** Session appears valid on server even after client has signed out.

**Why it happens:** The browser-side Supabase client stores session in localStorage. Server-side session check via middleware reads from cookies — these can be out of sync.

**How to avoid:** Always call `supabase.auth.getUser()` (not `getSession()`) in security-sensitive server code. `getUser()` validates the token against Supabase's server, not just against the local cache.

---

## Code Examples

### Full ConnectButton + SIWE Sign-In Button Component

```typescript
// dashboard/src/components/auth/wallet-auth-button.tsx
'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useSiweAuth } from '@/hooks/use-siwe-auth'

export function WalletAuthButton() {
  const { isConnected } = useAccount()
  const { signIn, isSigningIn, error } = useSiweAuth()

  return (
    <div className="flex flex-col gap-2">
      <ConnectButton />
      {isConnected && (
        <Button
          onClick={signIn}
          disabled={isSigningIn}
          variant="default"
        >
          {isSigningIn ? 'Signing...' : 'Sign in with Ethereum'}
        </Button>
      )}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
```

### Server Component — Reading Supabase Session

```typescript
// In a Server Component (e.g., dashboard/src/app/dashboard/page.tsx)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set() {}, // Server components cannot set cookies
        remove() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
```

### Environment Variables Required

```bash
# dashboard/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # SECRET: server only
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
SIWE_NONCE_SECRET=random_32_byte_hex_string  # For signing nonce cookies
SUPABASE_WALLET_SECRET=random_32_byte_hex_string  # For deterministic passwords
```

---

## Alternative: Lighter Stack (viem + custom modal)

If RainbowKit bundle size is a concern (it adds ~200KB gzipped due to WalletConnect dependencies):

| Approach | Bundle Size Impact | Wallet Support | Dev Speed |
|----------|-------------------|----------------|-----------|
| RainbowKit + wagmi | Large (~200KB+ gzipped) | 300+ wallets + WalletConnect | Fast |
| ConnectKit + wagmi | Medium (~150KB) | ~50 wallets + WalletConnect | Fast |
| viem + custom modal | Small (~50KB) | MetaMask, injected only | Slow |
| Dynamic.xyz | Large (external SDK) | 300+ incl. Solana | Very fast |

**Recommendation for x402Guard:** Use RainbowKit. The target users are DeFi power users who likely have MetaMask, Rainbow, or WalletConnect-compatible wallets. The bundle size tradeoff is acceptable for a dashboard app (not a public landing page). WalletConnect support is critical because users may connect hardware wallets via mobile.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ethers.js + Web3Modal v2 | wagmi v2 + viem + RainbowKit v2 | 2023-2024 | wagmi is now the standard; ethers.js is legacy |
| @supabase/auth-helpers-nextjs | @supabase/ssr | 2024 | auth-helpers deprecated; ssr package required for App Router |
| NextAuth.js CredentialsProvider for SIWE | Supabase custom auth or iron-session | 2024 | NextAuth adds friction when Supabase is already the auth provider |
| wagmi v1 (uses ethers.js) | wagmi v2 (uses viem) | 2024 | Breaking change — viem is a dependency, not ethers |
| RainbowKit v1 | RainbowKit v2 (getDefaultConfig API) | 2024 | v2 requires wagmi v2; config API changed completely |

**Deprecated/outdated:**
- `@wagmi/core` direct use in React without wagmi hooks: replaced by wagmi React package
- `ethers.providers.Web3Provider`: replaced by `viem` walletClient
- `@supabase/auth-helpers-nextjs` `createMiddlewareClient`: use `@supabase/ssr` `createServerClient`
- wagmi v1 `useConnect` with provider prop: replaced by v2 connector system

---

## Open Questions

1. **Supabase project configuration**
   - What we know: Supabase project URL and anon key are referenced in `src/lib/supabase.ts` via env vars
   - What's unclear: Whether a Supabase project is already provisioned, and whether email auth is enabled (required for the pseudo-email pattern)
   - Recommendation: Confirm Supabase project exists. In Supabase dashboard, enable "Email" provider under Authentication > Providers. Disable "Confirm email" requirement (since we are auto-confirming via admin API).

2. **Nonce storage for production**
   - What we know: Redis is already in the project (used by the Rust proxy for rate limiting and nonce tracking)
   - What's unclear: Whether the Next.js dashboard has access to the same Redis instance
   - Recommendation: Use `ioredis` or `@upstash/redis` in the Next.js API routes to store SIWE nonces. Cookie-only nonces are acceptable for an MVP but vulnerable to CSRF on same-origin attack surfaces.

3. **Chain selection**
   - What we know: x402Guard proxy supports Base and Solana; session keys are on Base Sepolia
   - What's unclear: Should sign-in only accept Base (chainId 8453) or also mainnet (1)?
   - Recommendation: Accept chainId 8453 (Base) and 84532 (Base Sepolia) for sign-in. Verify chainId in the SIWE message server-side. Reject other chains.

4. **Row Level Security (RLS) schema**
   - What we know: Supabase will store user records keyed by wallet address
   - What's unclear: What tables exist in Supabase and how they relate to the wallet address
   - Recommendation: Add a `profiles` table with `wallet_address` column linked to `auth.users.id`. Use RLS policies: `USING (auth.uid() = user_id)`.

5. **WalletConnect Project ID**
   - What we know: Required by RainbowKit v2
   - What's unclear: Whether one has been registered for this project
   - Recommendation: Register at https://cloud.walletconnect.com before implementation begins.

---

## Validation Architecture

> nyquist_validation not confirmed as enabled in config.json. Including for completeness.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (per config.json conventions: vitest) |
| Config file | None detected yet — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-7.1 | SIWE message constructed correctly | unit | `npx vitest run tests/siwe.test.ts` | Wave 0 |
| FR-7.1 | Signature verification rejects invalid sig | unit | `npx vitest run tests/auth-verify.test.ts` | Wave 0 |
| FR-7.1 | Nonce mismatch returns 400 | unit | `npx vitest run tests/auth-nonce.test.ts` | Wave 0 |
| FR-7.1 | Protected route redirects unauthenticated user | integration | `npx vitest run tests/middleware.test.ts` | Wave 0 |
| FR-7.1 | Logout clears session | unit | `npx vitest run tests/sign-out.test.ts` | Wave 0 |

### Wave 0 Gaps
- [ ] `dashboard/vitest.config.ts` — test runner config
- [ ] `dashboard/tests/siwe.test.ts` — SIWE message builder tests
- [ ] `dashboard/tests/auth-verify.test.ts` — verify API route unit tests
- [ ] `dashboard/tests/middleware.test.ts` — Next.js middleware route protection

---

## Sources

### Primary (HIGH confidence — training knowledge, August 2025 cutoff)
- RainbowKit v2 docs — `getDefaultConfig`, ConnectButton, `ssr: true` option
- wagmi v2 docs — `WagmiProvider`, `useAccount`, `useSignMessage`, viem peer dependency
- siwe package (v2) — `SiweMessage` constructor, `.verify()`, `generateNonce()`
- `@supabase/ssr` docs — `createServerClient`, middleware cookie handling

### Secondary (MEDIUM confidence — widely cited community patterns)
- EIP-4361 (Sign-In with Ethereum) specification — message format requirements
- Supabase auth admin API — `createUser`, `signInWithPassword` patterns
- Next.js App Router docs — middleware matcher, server components vs client components

### Tertiary (LOW confidence — requires verification)
- Exact package versions (wagmi 2.14.x, RainbowKit 2.2.x, siwe 2.3.x) — CHECK npm before installing
- `@supabase/ssr` version 0.5.x — CHECK npm; this package moves fast
- WalletConnect projectId requirement being mandatory for all connectors (not just WalletConnect connector) — verify in RainbowKit v2 release notes

---

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — library choices are well-established but exact versions need npm verification
- Architecture: HIGH — SIWE + wagmi + Supabase pattern is well-documented and widely deployed
- Pitfalls: HIGH — hydration issues, domain mismatch, service role key exposure are well-known and documented
- Code examples: MEDIUM — patterns are correct but API surface may have minor version-specific differences

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (wagmi and RainbowKit release frequently; re-verify versions monthly)

**CRITICAL pre-implementation steps:**
1. Run `npm show @rainbow-me/rainbowkit version` to get current stable version
2. Run `npm show wagmi version` to confirm current v2.x release
3. Run `npm show @supabase/ssr version` to get current release
4. Register WalletConnect Cloud project at https://cloud.walletconnect.com
5. Confirm Supabase project is provisioned with email auth enabled
