import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Server-only Supabase client using the service-role key. This key bypasses RLS
// and MUST never be imported into client components or exposed to the browser.
// The rc_lookup_data table has RLS enabled with no policies, so only this
// service-role client can read or write it.
let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  if (!cached) {
    cached = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return cached
}
