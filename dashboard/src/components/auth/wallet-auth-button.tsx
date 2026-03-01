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
