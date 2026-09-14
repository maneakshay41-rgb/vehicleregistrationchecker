import type { ChallanDetail, VehicleRcData } from "./vehicle-types"

/** Reads the first present, non-empty value among the provided keys. */
function pick(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim()
    }
  }
  return ""
}

/**
 * Masks a mobile number, keeping only the last 4 digits visible.
 * e.g. "9876543210" -> "******3210"
 */
function maskMobile(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length < 4) return ""
  return "*".repeat(digits.length - 4) + digits.slice(-4)
}

/** Replaces mobile numbers embedded in a free-text string with masked versions. */
function maskMobilesInText(value: string): string {
  return value.replace(/\d{7,}/g, (match) => maskMobile(match))
}

function normalizeChallans(raw: unknown): ChallanDetail[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const c = (item ?? {}) as Record<string, unknown>
    const offencesRaw = c["offences"] ?? c["offence_details"] ?? c["offense_details"]
    let offences: string[] = []
    if (Array.isArray(offencesRaw)) {
      offences = offencesRaw
        .map((o) => {
          if (o && typeof o === "object") {
            return pick(o as Record<string, unknown>, "offence_name", "offence", "name")
          }
          return String(o)
        })
        .filter((o) => o.trim() !== "")
    } else if (typeof offencesRaw === "string" && offencesRaw.trim() !== "") {
      offences = [offencesRaw.trim()]
    }

    return {
      challan_number: pick(c, "challan_number", "challan_no", "challanNumber"),
      challan_date: pick(c, "challan_date", "date", "challanDate"),
      amount: pick(c, "amount", "challan_amount", "fine_amount"),
      status: pick(c, "challan_status", "status", "payment_status"),
      accused_name: maskMobilesInText(pick(c, "accused_name", "owner_name", "name")),
      offences,
    }
  })
}

/**
 * Parses the raw QuickeKYC provider response and maps the vehicle
 * information found inside `payload.data` to our internal shape.
 */
export function parseRcResponse(payload: unknown): VehicleRcData | null {
  if (!payload || typeof payload !== "object") return null
  const root = payload as Record<string, unknown>

  // Vehicle information lives inside payload.data. Fall back to nested
  // shapes some responses use (data.data / result) before giving up.
  const dataCandidate =
    (root["data"] as Record<string, unknown> | undefined) ??
    (root["result"] as Record<string, unknown> | undefined)

  if (!dataCandidate || typeof dataCandidate !== "object") return null

  const nested = dataCandidate["data"]
  const data = (nested && typeof nested === "object" ? nested : dataCandidate) as Record<
    string,
    unknown
  >

  return {
    rc_number: pick(data, "rc_number", "registration_number", "reg_no"),
    owner_name: pick(data, "owner_name", "owner", "name"),
    mobile_number: pick(data, "mobile_number", "mobile", "mobile_no", "phone", "phone_number"),
    registration_date: pick(data, "registration_date", "reg_date"),
    maker_description: pick(data, "maker_description", "maker", "manufacturer"),
    maker_model: pick(data, "maker_model", "model", "vehicle_model"),
    variant: pick(data, "variant", "vehicle_variant"),
    fuel_type: pick(data, "fuel_type", "fuel"),
    body_type: pick(data, "body_type", "vehicle_body_type"),
    insurance_company: pick(data, "insurance_company", "insurer", "insurance_name"),
    insurance_upto: pick(data, "insurance_upto", "insurance_expiry", "insurance_valid_upto"),
    pucc_upto: pick(data, "pucc_upto", "pucc_valid_upto", "puc_upto"),
    registered_at: pick(data, "registered_at", "rto", "registered_rto"),
    rc_status: pick(data, "rc_status", "status", "vehicle_status"),
    rto_code: pick(data, "rto_code", "rto_cd", "office_code"),
    challan_details: normalizeChallans(
      data["challan_details"] ?? data["challans"] ?? data["challan"],
    ),
  }
}
