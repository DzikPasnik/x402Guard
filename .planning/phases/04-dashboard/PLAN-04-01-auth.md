---
phase: 04-dashboard
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - dashboard/package.json
  - dashboard/src/lib/wagmi-config.ts
  - dashboard/src/lib/supabase-server.ts
  - dashboard/src/lib/dal.ts
  - dashboard/src/components/providers/web3-provider.tsx
  - dashboard/src/components/auth/wallet-auth-button.tsx
  - dashboard/src/hooks/use-siwe-auth.ts
  - dashboard/src/hooks/use-sign-out.ts
  - dashboard/src/app/layout.tsx
  - dashboard/src/app/api/auth/nonce/route.ts
  - dashboard/src/app/api/auth/verify/route.ts
  - dashboard/src/app/login/page.tsx
  - dashboard/src/app/dashboard/page.tsx
  - dashboard/src/middleware.ts
  - dashboard/.env.example
autonomous: true
requirements:
  - FR-7.1

must_haves:
  truths:
    - "User can connect an Ethereum wallet via RainbowKit (MetaMask, WalletConnect, etc.)"
    - "User can sign an EIP-4361 (SIWE) message after wallet connection"
    - "Server verifies SIWE signature and creates a Supabase session"
    - "Unauthenticated users are redirected from /dashboard/* to /login"
    - "Authenticated users can sign out (wallet disconnect + Supabase session clear)"
    - "Nonce is single-use and expires after 5 minutes"
  artifacts:
    - path: "dashboard/src/lib/wagmi-config.ts"
      provides: "wagmi configuration with Base + Base Sepolia chains"
      contains: "getDefaultConfig"
    - path: "dashboard/src/components/providers/web3-provider.tsx"
      provides: "WagmiProvider + QueryClientProvider + RainbowKitProvider tree"
      exports: ["Web3Providers"]
    - path: "dashboard/src/app/api/auth/nonce/route.ts"
      provides: "GET handler generating SIWE nonce stored in httpOnly cookie"
      exports: ["GET"]
    - path: "dashboard/src/app/api/auth/verify/route.ts"
      provides: "POST handler verifying SIWE signature, creating Supabase user/session"
      exports: ["POST"]
    - path: "dashboard/src/hooks/use-siwe-auth.ts"
      provides: "Client hook: fetchNonce -> buildSiweMessage -> signMessage -> verify -> setSession"
      exports: ["useSiweAuth"]
    - path: "dashboard/src/hooks/use-sign-out.ts"
      provides: "Client hook: supabase.signOut + wallet disconnect + redirect"
      exports: ["useSignOut"]
    - path: "dashboard/src/lib/supabase-server.ts"
      provides: "Server-side Supabase client using @supabase/ssr createServerClient"
      exports: ["createSupabaseServerClient"]
    - path: "dashboard/src/lib/dal.ts"
      provides: "Data access layer with verifySession() for server components"
      exports: ["verifySession"]
    - path: "dashboard/src/middleware.ts"
      provides: "Next.js middleware protecting /dashboard/* routes, refreshing Supabase session"
    - path: "dashboard/src/components/auth/wallet-auth-button.tsx"
      provides: "ConnectButton + Sign In with Ethereum button component"
      exports: ["WalletAuthButton"]
    - path: "dashboard/src/app/login/page.tsx"
      provides: "Login page rendering WalletAuthButton"
    - path: "dashboard/src/app/dashboard/page.tsx"
      provides: "Placeholder dashboard page with verifySession() guard"
  key_links:
    - from: "dashboard/src/hooks/use-siwe-auth.ts"
      to: "/api/auth/nonce"
      via: "fetch GET to obtain nonce"
      pattern: "fetch.*api/auth/nonce"
    - from: "dashboard/src/hooks/use-siwe-auth.ts"
      to: "/api/auth/verify"
      via: "fetch POST with SIWE message + signature"
      pattern: "fetch.*api/auth/verify"
    - from: "dashboard/src/app/api/auth/verify/route.ts"
      to: "supabase.auth"
      via: "signInWithPassword + admin.createUser for wallet-based auth"
      pattern: "supabaseAdmin\\.auth\\.(signInWithPassword|admin\\.createUser)"
    - from: "dashboard/src/middleware.ts"
      to: "@supabase/ssr"
      via: "createServerClient reads/writes session cookies"
      pattern: "createServerClient"
    - from: "dashboard/src/app/layout.tsx"
      to: "dashboard/src/components/providers/web3-provider.tsx"
      via: "Web3Providers wrapping children"
      pattern: "Web3Providers"
    - from: "dashboard/src/hooks/use-siwe-auth.ts"
      to: "wagmi useSignMessage"
      via: "signMessageAsync signs SIWE message with wallet"
      pattern: "signMessageAsync"

user_setup:
  - service: walletconnect
    why: "RainbowKit v2 requires WalletConnect Cloud project ID for all wallet connectors"
    env_vars:
      - name: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
        source: "https://cloud.walletconnect.com -> Create Project -> Copy Project ID"
  - service: supabase
    why: "Authentication backend for session management"
    env_vars:
      - name: NEXT_PUBLIC_SUPABASE_URL
        source: "Supabase Dashboard -> Settings -> API -> Project URL"
      - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
        source: "Supabase Dashboard -> Settings -> API -> anon public key"
      - name: SUPABASE_SERVICE_ROLE_KEY
        source: "Supabase Dashboard -> Settings -> API -> service_role secret key (NEVER expose to client)"
    dashboard_config:
      - task: "Enable Email provider under Authentication -> Providers"
        location: "Supabase Dashboard -> Authentication -> Providers -> Email"
      - task: "Disable 'Confirm email' requirement (auto-confirmed via admin API)"
        location: "Supabase Dashboard -> Authentication -> Providers -> Email -> toggle off confirm email"
  - service: secrets
    why: "Server-side secrets for nonce signing and wallet password derivation"
    env_vars:
      - name: SIWE_NONCE_SECRET
        source: "Generate with: openssl rand -hex 32"
      - name: SUPABASE_WALLET_SECRET
        source: "Generate with: openssl rand -hex 32"
---

<objective>
Set up wallet-based authentication for the x402Guard dashboard using RainbowKit + wagmi + SIWE + Supabase Auth.

Purpose: FR-7.1 requires user authentication via wallet connect. This is the foundational auth layer that all subsequent dashboard plans (agent overview, guardrail CRUD, session key management, real-time monitoring) depend on. Without auth, no protected routes exist.

Output: Working wallet connect -> SIWE sign-in -> Supabase session flow. Protected /dashboard/* routes. Login page. Sign-out capability.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-dashboard/RESEARCH-auth.md

@dashboard/package.json
@dashboard/src/lib/supabase.ts
@dashboard/src/app/layout.tsx
@dashboard/src/app/page.tsx
@dashboard/tsconfig.json
@dashboard/next.config.ts

<interfaces>
<!-- Existing dashboard code the executor must integrate with. -->

From dashboard/src/lib/supabase.ts:
```typescript
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

From dashboard/src/app/layout.tsx:
```typescript
// Root layout with Geist fonts, wraps children in <body>
// Must be updated to wrap children with Web3Providers
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>)
```

From dashboard/src/components/ui/button.tsx:
```typescript
// shadcn Button component — use for Sign In button
export { Button, buttonVariants }
```

From dashboard/src/components/ui/card.tsx:
```typescript
// shadcn Card component — use for login card layout
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
```

From dashboard/package.json:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.97.0",
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
    // NOTE: No wallet libs installed yet
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies and create wagmi config + Web3Providers + update layout</name>
  <files>
    dashboard/package.json
    dashboard/src/lib/wagmi-config.ts
    dashboard/src/components/providers/web3-provider.tsx
    dashboard/src/app/layout.tsx
  </files>
  <action>
**Step 1: Install wallet auth dependencies.**

Run from the `dashboard/` directory:
```bash
npm install @rainbow-me/rainbowkit wagmi viem @tanstack/react-query siwe @supabase/ssr
```

Verify all packages resolve without peer dependency conflicts. If wagmi or RainbowKit versions conflict, pin to the latest compatible v2.x release.

**Step 2: Create `dashboard/src/lib/wagmi-config.ts`.**

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base, baseSepolia } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'x402Guard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [base, baseSepolia],
  ssr: true, // REQUIRED: prevents hydration mismatch in Next.js App Router
})
```

Only export the config object. Do NOT create providers here. Chains are limited to Base (8453) and Base Sepolia (84532) per user decision — no mainnet Ethereum. The `ssr: true` flag is critical to avoid hydration errors since wallet state is undefined on the server.

**Step 3: Create `dashboard/src/components/providers/web3-provider.tsx`.**

Mark as `'use client'` at the top. This is a client component because wagmi and RainbowKit use browser-only APIs (localStorage, injected providers).

```typescript
'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { wagmiConfig } from '@/lib/wagmi-config'
import '@rainbow-me/rainbowkit/styles.css'

export function Web3Providers({ children }: { children: React.ReactNode }) {
  // QueryClient must be created inside component — prevents shared state between SSR requests
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

Import `@rainbow-me/rainbowkit/styles.css` here (single import point for all RainbowKit styling). Provider nesting order matters: WagmiProvider (outermost) -> QueryClientProvider -> RainbowKitProvider (innermost).

**Step 4: Update `dashboard/src/app/layout.tsx`.**

Import Web3Providers and wrap `{children}` inside it. Preserve existing Geist font setup, metadata, and className on body. The layout remains a Server Component — only the Web3Providers component is `'use client'`.

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Web3Providers } from "@/components/providers/web3-provider";
import "./globals.css";

// ... keep existing font setup and metadata unchanged ...

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Web3Providers>
          {children}
        </Web3Providers>
      </body>
    </html>
  );
}
```
  </action>
  <verify>
    <automated>cd dashboard && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `@rainbow-me/rainbowkit`, `wagmi`, `viem`, `@tanstack/react-query`, `siwe`, `@supabase/ssr` appear in package.json dependencies
    - `wagmi-config.ts` exports config with `ssr: true` and chains [base, baseSepolia]
    - `web3-provider.tsx` exports `Web3Providers` with correct provider nesting
    - `layout.tsx` wraps children in `<Web3Providers>`
    - `npm run build` completes without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Create SIWE auth API routes + client hooks + server-side Supabase client</name>
  <files>
    dashboard/src/app/api/auth/nonce/route.ts
    dashboard/src/app/api/auth/verify/route.ts
    dashboard/src/lib/supabase-server.ts
    dashboard/src/lib/dal.ts
    dashboard/src/hooks/use-siwe-auth.ts
    dashboard/src/hooks/use-sign-out.ts
  </files>
  <action>
**Step 1: Create `dashboard/src/lib/supabase-server.ts`.**

Server-side Supabase client using `@supabase/ssr`. This replaces the deprecated `@supabase/auth-helpers-nextjs`. Used in middleware and server components.

```typescript
import { createServerClient as createSupabaseSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createSupabaseSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll called from Server Component — ignore
            // Middleware will handle cookie refresh
          }
        },
      },
    }
  )
}
```

IMPORTANT: Use the `getAll`/`setAll` cookie pattern (not the individual get/set/remove pattern). This is the current `@supabase/ssr` API. The `cookies()` call from `next/headers` is async in Next.js 16.x — await it.

**Step 2: Create `dashboard/src/lib/dal.ts` (Data Access Layer).**

This provides `verifySession()` for server components to check authentication. Uses `getUser()` (not `getSession()`) because `getUser()` validates the token server-side against Supabase, preventing stale/tampered tokens.

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function verifySession() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return { user }
}
```

**Step 3: Create `dashboard/src/app/api/auth/nonce/route.ts`.**

GET handler that generates a cryptographic nonce, stores it in an httpOnly cookie (5-minute TTL), and returns it in the response body.

```typescript
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
```

Security notes:
- httpOnly: JavaScript cannot read the cookie (XSS protection)
- secure: only sent over HTTPS in production
- sameSite strict: prevents CSRF
- maxAge 300s: limits replay window

**Step 4: Create `dashboard/src/app/api/auth/verify/route.ts`.**

POST handler that:
1. Reads the nonce from the httpOnly cookie
2. Reconstructs the SIWE message and verifies the signature
3. Validates chainId is Base (8453) or Base Sepolia (84532)
4. Creates or retrieves a Supabase user via pseudo-email pattern
5. Returns the Supabase session tokens
6. Clears the nonce cookie (single-use)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { SiweMessage } from 'siwe'
import { createClient } from '@supabase/supabase-js'

// Admin client — uses SERVICE_ROLE_KEY. NEVER expose to client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_CHAIN_IDS = [8453, 84532] // Base Mainnet, Base Sepolia

export async function POST(req: NextRequest) {
  try {
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
    const deterministicPassword = `${process.env.SUPABASE_WALLET_SECRET}:${walletAddress}`

    // Try sign-in first
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: pseudoEmail,
        password: deterministicPassword,
      })

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        // User does not exist — create via admin API
        const { error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: pseudoEmail,
            password: deterministicPassword,
            email_confirm: true, // Auto-confirm — no email verification needed
            user_metadata: { wallet_address: walletAddress },
          })

        if (createError) {
          return NextResponse.json(
            { error: 'Failed to create user account' },
            { status: 500 },
          )
        }

        // Sign in the newly created user
        const { data: newSignIn, error: newSignInError } =
          await supabaseAdmin.auth.signInWithPassword({
            email: pseudoEmail,
            password: deterministicPassword,
          })

        if (newSignInError || !newSignIn.session) {
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
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 401 },
    )
  }
}
```

SECURITY CRITICAL:
- `SUPABASE_SERVICE_ROLE_KEY` is used ONLY here in this server-side route. It bypasses RLS. NEVER import it in client components.
- Nonce cookie is cleared after successful verification to prevent replay.
- Chain ID is validated server-side — reject anything except Base chains.
- The `deterministicPassword` is derived from `SUPABASE_WALLET_SECRET` + wallet address. The SIWE signature verification above is the real security gate.

**Step 5: Create `dashboard/src/hooks/use-siwe-auth.ts`.**

Client-side hook that orchestrates the full SIWE flow: fetch nonce -> build message -> sign with wallet -> verify on server -> set Supabase session.

```typescript
'use client'

import { useSignMessage, useAccount, useChainId } from 'wagmi'
import { SiweMessage } from 'siwe'
import { supabase } from '@/lib/supabase'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export function useSiweAuth() {
  const { address } = useAccount()
  const chainId = useChainId()
  const { signMessageAsync } = useSignMessage()
  const router = useRouter()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!address || !chainId) {
      setError('Wallet not connected')
      return
    }

    setIsSigningIn(true)
    setError(null)

    try {
      // Step 1: Fetch nonce from server
      const nonceRes = await fetch('/api/auth/nonce')
      if (!nonceRes.ok) {
        throw new Error('Failed to fetch nonce')
      }
      const { nonce } = await nonceRes.json()

      // Step 2: Build EIP-4361 SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to x402Guard Dashboard. This request will not trigger any blockchain transaction or cost any gas.',
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
        body: JSON.stringify({ message: message.toMessage(), signature }),
      })

      if (!verifyRes.ok) {
        const { error: verifyError } = await verifyRes.json()
        throw new Error(verifyError || 'Verification failed')
      }

      const { session } = await verifyRes.json()

      // Step 5: Set Supabase session in browser client
      if (session) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
      }

      // Step 6: Redirect to dashboard
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof Error) {
        // User rejected signature — not an error to display dramatically
        if (err.message.includes('User rejected') || err.message.includes('user rejected')) {
          setError('Signature request was cancelled')
        } else {
          setError(err.message)
        }
      } else {
        setError('Sign-in failed')
      }
    } finally {
      setIsSigningIn(false)
    }
  }, [address, chainId, signMessageAsync, router])

  return { signIn, isSigningIn, error }
}
```

NOTE: Uses `message.toMessage()` (the string representation) to send to the server, NOT the SiweMessage object. The server reconstructs the SiweMessage from the string. Uses `useChainId()` (not `useAccount().chainId`) for the connected chain.

**Step 6: Create `dashboard/src/hooks/use-sign-out.ts`.**

```typescript
'use client'

import { useDisconnect } from 'wagmi'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCallback } from 'react'

export function useSignOut() {
  const { disconnect } = useDisconnect()
  const router = useRouter()

  const signOut = useCallback(async () => {
    // 1. Sign out from Supabase (clears session + cookies)
    await supabase.auth.signOut()
    // 2. Disconnect wallet from wagmi state
    disconnect()
    // 3. Redirect to home
    router.push('/')
  }, [disconnect, router])

  return { signOut }
}
```
  </action>
  <verify>
    <automated>cd dashboard && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - GET /api/auth/nonce returns JSON `{ nonce }` and sets httpOnly cookie `siwe-nonce` with maxAge 300
    - POST /api/auth/verify accepts `{ message, signature }`, validates nonce from cookie, verifies SIWE signature, validates chainId in [8453, 84532], creates/retrieves Supabase user via pseudo-email pattern, returns `{ session }`, clears nonce cookie
    - `useSiweAuth` hook exports `{ signIn, isSigningIn, error }` — full SIWE flow from nonce fetch to Supabase session set
    - `useSignOut` hook exports `{ signOut }` — clears Supabase session, disconnects wallet, redirects to /
    - `createSupabaseServerClient` uses `@supabase/ssr` with getAll/setAll cookie pattern
    - `verifySession()` uses `getUser()` (NOT `getSession()`) and redirects to /login if unauthenticated
    - `SUPABASE_SERVICE_ROLE_KEY` appears ONLY in verify/route.ts (server-side)
    - `npm run build` completes without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Create login page, middleware route protection, and .env.example</name>
  <files>
    dashboard/src/app/login/page.tsx
    dashboard/src/app/dashboard/page.tsx
    dashboard/src/middleware.ts
    dashboard/src/components/auth/wallet-auth-button.tsx
    dashboard/.env.example
  </files>
  <action>
**Step 1: Create `dashboard/src/components/auth/wallet-auth-button.tsx`.**

A client component that shows the RainbowKit ConnectButton and, once a wallet is connected, shows a "Sign In with Ethereum" button that triggers the SIWE flow.

```typescript
'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useSiweAuth } from '@/hooks/use-siwe-auth'
import { useState, useEffect } from 'react'

export function WalletAuthButton() {
  const { isConnected } = useAccount()
  const { signIn, isSigningIn, error } = useSiweAuth()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch — wallet state is undefined on server
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <ConnectButton />
      {isConnected && (
        <Button
          onClick={signIn}
          disabled={isSigningIn}
          size="lg"
          className="w-full max-w-xs"
        >
          {isSigningIn ? 'Signing in...' : 'Sign In with Ethereum'}
        </Button>
      )}
      {error && (
        <p className="text-sm text-destructive max-w-xs text-center">{error}</p>
      )}
    </div>
  )
}
```

The `mounted` check prevents SSR hydration mismatch. Before mount, show a skeleton placeholder matching the button dimensions. After mount, wallet state is available and the real UI renders.

**Step 2: Create `dashboard/src/app/login/page.tsx`.**

Server component page that renders the WalletAuthButton inside a centered card layout. Uses existing shadcn Card components.

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WalletAuthButton } from '@/components/auth/wallet-auth-button'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">x402Guard</CardTitle>
          <CardDescription>
            Connect your wallet to access the dashboard.
            Sign a message to verify ownership — no gas fees, no blockchain transaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <WalletAuthButton />
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            x402Guard uses Sign-In with Ethereum (EIP-4361) for authentication.
            Your wallet address identifies your account. We never request transaction approval during sign-in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Create `dashboard/src/middleware.ts`.**

Next.js middleware that:
1. Refreshes the Supabase session on every request (handles token expiry)
2. Redirects unauthenticated users from `/dashboard/*` to `/login`
3. Redirects authenticated users from `/login` to `/dashboard`

```typescript
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
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, ...([options] as [any]))
          })
        },
      },
    }
  )

  // Refresh session — MUST call getUser() to validate token server-side
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Protect /dashboard/* — redirect to /login if not authenticated
  if (pathname.startsWith('/dashboard') && !user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // If authenticated user visits /login, redirect to /dashboard
  if (pathname === '/login' && user) {
    const dashboardUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Match /dashboard and all sub-paths
    '/dashboard/:path*',
    // Match /login for redirect-if-authenticated
    '/login',
  ],
}
```

Security notes:
- Uses `getUser()` (not `getSession()`). `getUser()` validates the JWT against Supabase's servers. `getSession()` only checks local cache and is vulnerable to tampered tokens.
- The middleware runs at the Edge before the page renders — no flash of protected content for unauthenticated users.
- Matcher is explicit: only `/dashboard/*` and `/login`. API routes and static assets are excluded.

**Step 4: Create `dashboard/.env.example`.**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WalletConnect (register at https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id

# Server secrets (generate with: openssl rand -hex 32)
SIWE_NONCE_SECRET=generate-me-with-openssl-rand-hex-32
SUPABASE_WALLET_SECRET=generate-me-with-openssl-rand-hex-32
```

**Step 5: Create placeholder dashboard page (needed for redirect target).**

Create `dashboard/src/app/dashboard/page.tsx` as a minimal placeholder so the /dashboard route exists:

```typescript
import { verifySession } from '@/lib/dal'

export default async function DashboardPage() {
  const { user } = await verifySession()

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">x402Guard Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {user.user_metadata?.wallet_address ?? user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Agent overview, guardrails, and session key management coming in Plan 04-02.
        </p>
      </div>
    </div>
  )
}
```

This page calls `verifySession()` which redirects to /login if not authenticated. This provides double-layer protection (middleware + server component check).
  </action>
  <verify>
    <automated>cd dashboard && npx next build 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `WalletAuthButton` component renders ConnectButton and conditional "Sign In with Ethereum" button with hydration-safe mounting
    - `/login` page renders centered Card with WalletAuthButton and explanatory text
    - `/dashboard` placeholder page exists and calls `verifySession()`
    - Middleware protects `/dashboard/*` (redirects to /login if no user) and redirects authenticated users from /login to /dashboard
    - Middleware uses `getUser()` (not `getSession()`) for server-side token validation
    - `.env.example` documents all 6 required environment variables with generation instructions
    - `npm run build` succeeds (may show warnings about missing env vars at build time — acceptable since .env.local is not committed)
  </done>
</task>

</tasks>

<verification>
**Full auth flow verification (requires .env.local with real values):**

1. `cd dashboard && npm run dev`
2. Visit http://localhost:3000/dashboard -> should redirect to /login
3. Visit http://localhost:3000/login -> should show wallet connect card
4. Click ConnectButton -> wallet picker appears
5. Connect wallet -> "Sign In with Ethereum" button appears
6. Click Sign In -> wallet prompts SIWE signature (message includes x402Guard domain, no gas)
7. Sign message -> redirects to /dashboard, shows wallet address
8. Visit /login again -> redirects to /dashboard (already authenticated)
9. (Future: sign out -> clears session, redirects to /)

**Build verification (no env vars needed):**
```bash
cd dashboard && npm run build
```
Build must pass. Runtime auth flow requires actual Supabase project + WalletConnect project ID.

**Security verification checklist:**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only appears in `dashboard/src/app/api/auth/verify/route.ts`
- [ ] Nonce cookie is httpOnly, secure (in production), sameSite strict, maxAge 300
- [ ] Nonce cookie cleared after successful verification (maxAge: 0)
- [ ] Chain ID validated server-side against [8453, 84532]
- [ ] Middleware uses `getUser()` not `getSession()`
- [ ] `ssr: true` set in wagmi config
- [ ] No `console.log` in production code paths
</verification>

<success_criteria>
1. All 6 npm packages installed: @rainbow-me/rainbowkit, wagmi, viem, @tanstack/react-query, siwe, @supabase/ssr
2. `npm run build` in dashboard/ succeeds with zero errors
3. wagmi config limited to Base (8453) + Base Sepolia (84532) chains with ssr: true
4. SIWE nonce endpoint generates nonce + httpOnly cookie (5-min TTL)
5. SIWE verify endpoint validates signature + chainId + creates Supabase user + clears nonce
6. Client hook orchestrates full SIWE flow: nonce -> sign -> verify -> session -> redirect
7. Middleware protects /dashboard/* and redirects /login for authenticated users
8. SUPABASE_SERVICE_ROLE_KEY confined to single server-side file
9. .env.example documents all required environment variables
</success_criteria>

<output>
After completion, create `.planning/phases/04-dashboard/04-01-SUMMARY.md`
</output>
