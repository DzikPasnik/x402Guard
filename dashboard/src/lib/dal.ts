import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function verifySession() {
  // Dev-only: skip auth for local preview
  if (process.env.DEV_SKIP_AUTH === 'true') {
    return {
      user: {
        id: 'dev-user',
        email: '0xdev@wallet.x402guard.local',
        user_metadata: { wallet_address: '0xdev' },
      },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return { user }
}
