import { createClient } from '@supabase/supabase-js'

// Fallback URLs for build-time — Supabase client requires non-empty strings.
// Runtime will use actual env vars from .env.local.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
