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
