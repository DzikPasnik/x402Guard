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
