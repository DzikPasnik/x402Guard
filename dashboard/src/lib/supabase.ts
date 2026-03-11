import { createBrowserClient } from '@supabase/ssr'

// Fallback URLs for build-time — Supabase client requires non-empty strings.
// Runtime will use actual env vars from .env.local.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// MUST use createBrowserClient from @supabase/ssr (NOT createClient from @supabase/supabase-js).
// The SSR browser client stores session in cookies, which middleware can read.
// createClient stores in localStorage — invisible to server-side middleware.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
