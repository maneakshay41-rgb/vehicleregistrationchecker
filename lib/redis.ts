import { Redis } from "@upstash/redis"

// Single shared Upstash Redis client. Uses the KV_REST_API_* variables provided
// by the Upstash integration. Server-only — never import this into client code.
let client: Redis | null = null

export function getRedis(): Redis {
  if (client) return client

  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error("Upstash Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing).")
  }

  client = new Redis({ url, token })
  return client
}

// Redis keys used by the auth/reset system.
export const REDIS_KEYS = {
  passwordHash: "staff:password_hash",
  sessionEpoch: "staff:session_epoch",
  otp: "pwreset:otp",
  ticket: "pwreset:ticket",
} as const

// Monotonic marker bumped on every password reset. Sessions issued before the
// current epoch are considered invalid, which logs every device out at once.
export async function getSessionEpoch(): Promise<number> {
  const value = await getRedis().get<number | string>(REDIS_KEYS.sessionEpoch)
  if (value === null || value === undefined) return 0
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function bumpSessionEpoch(): Promise<number> {
  const epoch = Date.now()
  await getRedis().set(REDIS_KEYS.sessionEpoch, epoch)
  return epoch
}
