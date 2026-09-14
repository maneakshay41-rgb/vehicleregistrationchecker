import "server-only"

import type { StaffViewData } from "./vehicle-types"

const STATUSES = ["Active", "Applied", "NA"] as const

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** FNV-1a hash so the same RC number always seeds the same display values. */
function hashSeed(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic PRNG seeded from the hash above. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Builds the non-sensitive Staff View display values for a lookup.
 *
 * Values are derived ONLY from the RC number via a seeded PRNG, never from the
 * genuine registration/insurance/last-trip data. Deterministic per RC number so
 * repeated lookups stay stable. All dates are guaranteed valid and in the past.
 */
export function buildStaffView(rcNumber: string): StaffViewData {
  const rng = mulberry32(hashSeed(rcNumber))
  const now = Date.now()
  const DAY = 86_400_000

  // Creation date: between 30 and 1825 days ago (always past, always valid).
  const creationDaysAgo = 30 + Math.floor(rng() * (1825 - 30))
  const creationDate = new Date(now - creationDaysAgo * DAY)

  const status = STATUSES[Math.floor(rng() * STATUSES.length)]

  // Last trip: ~25% show "No data", otherwise a past date after the creation date.
  let lastTripDate = "No data"
  if (rng() >= 0.25) {
    const maxAgo = Math.max(1, creationDaysAgo - 1)
    const tripDaysAgo = 1 + Math.floor(rng() * maxAgo)
    lastTripDate = formatDate(new Date(now - tripDaysAgo * DAY))
  }

  return {
    rc_number: rcNumber,
    creation_date: formatDate(creationDate),
    status,
    last_trip_date: lastTripDate,
  }
}
