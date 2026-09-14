import "server-only"

import { getSupabaseAdmin } from "@/lib/supabase-admin"

interface LogRcLookupArgs {
  rcNumber: string
  // The complete, original, unmodified QuickeKYC API response. Stored as jsonb
  // so no fields are lost. This must never be synthetic/demo Staff View data.
  payload: unknown
}

// Persists a single RC lookup to Supabase. Runs entirely server-side and never
// throws: a database failure is logged for operators but never affects the
// user-facing response and never leaks credentials or raw data to the browser.
export async function logRcLookup({ rcNumber, payload }: LogRcLookupArgs): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.log("[v0] RC logging skipped: Supabase server credentials are not configured")
    return
  }

  try {
    const { error } = await supabase.from("rc_lookup_data").insert({
      rc_number: rcNumber,
      api_response: payload,
    })

    if (error) {
      console.log(`[v0] RC logging failed to insert row: ${error.message}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    console.log(`[v0] RC logging threw an unexpected error: ${message}`)
  }
}
