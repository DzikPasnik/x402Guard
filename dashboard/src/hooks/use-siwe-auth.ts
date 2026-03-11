'use client'

import { useSignMessage, useAccount, useSwitchChain } from 'wagmi'
import { SiweMessage } from 'siwe'
import { supabase } from '@/lib/supabase'
import { useState, useCallback } from 'react'

const ALLOWED_CHAIN_IDS = [8453, 84532] // Base Mainnet, Base Sepolia

export function useSiweAuth() {
  const { address, chainId: walletChainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!address) {
      setError('Wallet not connected. Please connect your wallet first.')
      return
    }

    setIsSigningIn(true)
    setError(null)
    setStatus(null)

    try {
      // Step 0: Ensure we're on an allowed chain (Base or Base Sepolia)
      // Use walletChainId from useAccount() — NOT useChainId() which returns
      // the wagmi config default, not the wallet's actual chain.
      let activeChainId = walletChainId ?? 0
      if (!ALLOWED_CHAIN_IDS.includes(activeChainId)) {
        setStatus('Switching to Base Sepolia...')
        try {
          await switchChainAsync({ chainId: 84532 }) // Switch to Base Sepolia
          activeChainId = 84532
        } catch {
          setError(`Wrong network. Please switch to Base or Base Sepolia in your wallet.`)
          return
        }
      }

      // Step 1: Fetch nonce from server
      setStatus(null)
      const nonceRes = await fetch('/api/auth/nonce')
      if (!nonceRes.ok) {
        throw new Error(`Failed to fetch nonce (${nonceRes.status})`)
      }
      const { nonce } = await nonceRes.json()

      // Step 2: Build EIP-4361 SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to x402Guard Dashboard. This request will not trigger any blockchain transaction or cost any gas.',
        uri: window.location.origin,
        version: '1',
        chainId: activeChainId,
        nonce,
      })
      const preparedMessage = message.prepareMessage()

      // Step 3: Sign with wallet (this opens the wallet popup)
      setStatus('Check your wallet to sign the message...')
      let signature: string
      try {
        signature = await signMessageAsync({ message: preparedMessage })
      } catch (signErr) {
        const msg = signErr instanceof Error ? signErr.message : String(signErr)
        if (msg.includes('reject') || msg.includes('denied') || msg.includes('declined') || msg.includes('cancel')) {
          setError('Signature request was cancelled.')
        } else {
          setError(`Wallet error: ${msg}`)
        }
        return
      }

      // Step 4: Verify on server
      setStatus('Verifying signature...')
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.toMessage(), signature }),
      })

      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}))
        throw new Error((body as Record<string, string>).error || `Verification failed (${verifyRes.status})`)
      }

      const { session } = await verifyRes.json()

      // Step 5: Set Supabase session in browser client
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error('Server returned empty session. Please try again.')
      }

      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })

      // Step 6: Redirect to dashboard
      // Use window.location for full page navigation so middleware sees the new cookies.
      // router.push() does client-side navigation which can race with cookie writes.
      window.location.href = '/dashboard'
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      setError(msg)
    } finally {
      setIsSigningIn(false)
      setStatus(null)
    }
  }, [address, walletChainId, signMessageAsync, switchChainAsync])

  return { signIn, isSigningIn, error, status }
}
