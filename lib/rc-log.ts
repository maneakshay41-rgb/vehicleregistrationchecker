import "server-only"

import { getSupabaseAdmin } from "@/lib/supabase-admin"

interface LogRcLookupArgs {
  rcNumber: string
  // The complete, original, unmodified QuickeKYC API response. Stored as jsonb
  // so no fields are lost. This must never be synthetic/demo Staff View data.
  payload: unknown
}

/** Reads the first present, non-empty value among the provided keys. */
function pick(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim()
    }
  }
  return null
}

/**
 * Navigates the raw QuickeKYC response to the object that holds the vehicle
 * fields. Mirrors the navigation in parse-rc.ts (payload.data / result, then a
 * nested .data) so the extracted columns match the real provider shape.
 */
function getVehicleNode(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null
  const root = payload as Record<string, unknown>

  const dataCandidate =
    (root["data"] as Record<string, unknown> | undefined) ??
    (root["result"] as Record<string, unknown> | undefined)

  if (!dataCandidate || typeof dataCandidate !== "object") return null

  const nested = dataCandidate["data"]
  return (nested && typeof nested === "object" ? nested : dataCandidate) as Record<string, unknown>
}

/**
 * Extracts the flat, human-readable columns from the raw response. Values are
 * intentionally UNMASKED (e.g. full mobile number): this row lives only in the
 * server-side, RLS-locked rc_lookup_data table that staff cannot read, and it
 * is the operator's system-of-record copy of the original API data.
 */
function extractColumns(payload: unknown) {
  const data = getVehicleNode(payload)
  if (!data) return {}

  return {
    vehicle_number: pick(data, "rc_number", "registration_number", "reg_no"),
    registration_date: pick(data, "registration_date", "reg_date"),
    owner_name: pick(data, "owner_name", "owner", "name"),
    mobile_number: pick(data, "mobile_number", "mobile", "mobile_no", "phone", "phone_number"),
    rto: pick(data, "rto_code", "rto_cd", "office_code", "registered_at", "rto", "registered_rto"),
    maker: pick(data, "maker_description", "maker", "manufacturer"),
    model: pick(data, "maker_model", "model", "vehicle_model"),
    variant: pick(data, "variant", "vehicle_variant"),
    fuel: pick(data, "fuel_type", "fuel"),
    insurance_company: pick(data, "insurance_company", "insurer", "insurance_name"),
    insurance_valid_upto: pick(data, "insurance_upto", "insurance_expiry", "insurance_valid_upto"),
    pucc_valid_upto: pick(data, "pucc_upto", "pucc_valid_upto", "puc_upto"),
  }
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
      // Flat, easy-to-view columns mapped from the actual QuickeKYC response.
      ...extractColumns(payload),
      // Complete original response kept intact as the backup of record.
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
