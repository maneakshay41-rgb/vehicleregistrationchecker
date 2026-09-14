import { Ratelimit } from "@upstash/ratelimit"
import { getRedis, REDIS_KEYS } from "@/lib/redis"
import { generateNonce, generateOtp, hashOtp, timingSafeEqual } from "@/lib/password"

export const OTP_TTL_SECONDS = 10 * 60 // 10 minutes
const TICKET_TTL_SECONDS = 10 * 60
const MAX_OTP_ATTEMPTS = 5

export const RESET_TICKET_COOKIE = "rc_pwreset"

export const resetTicketCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: TICKET_TTL_SECONDS,
}

// Rate limiters. Cooldown throttles rapid resends; the cap bounds total sends
// per window; verify bounds guessing across the whole flow.
let cooldownLimiter: Ratelimit | null = null
let capLimiter: Ratelimit | null = null
let verifyLimiter: Ratelimit | null = null

function getCooldownLimiter(): Ratelimit {
  if (!cooldownLimiter) {
    cooldownLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.fixedWindow(1, "60 s"),
      prefix: "rl:pwreset:cooldown",
    })
  }
  return cooldownLimiter
}

function getCapLimiter(): Ratelimit {
  if (!capLimiter) {
    capLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:pwreset:cap",
    })
  }
  return capLimiter
}

function getVerifyLimiter(): Ratelimit {
  if (!verifyLimiter) {
    verifyLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      prefix: "rl:pwreset:verify",
    })
  }
  return verifyLimiter
}

interface StoredOtp {
  hash: string
  attempts: number
}

export interface SendCheck {
  allowed: boolean
  retryAfterSeconds?: number
}

// Enforces both the per-minute cooldown and the per-window cap.
export async function checkSendAllowed(identifier: string): Promise<SendCheck> {
  const cooldown = await getCooldownLimiter().limit(identifier)
  if (!cooldown.success) {
    return { allowed: false, retryAfterSeconds: retryAfter(cooldown.reset) }
  }
  const cap = await getCapLimiter().limit(identifier)
  if (!cap.success) {
    return { allowed: false, retryAfterSeconds: retryAfter(cap.reset) }
  }
  return { allowed: true }
}

export async function checkVerifyAllowed(identifier: string): Promise<boolean> {
  const result = await getVerifyLimiter().limit(identifier)
  return result.success
}

function retryAfter(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

// Stores only the keyed hash of the OTP plus an attempt counter, with a TTL so
// it expires automatically after 10 minutes.
export async function storeOtp(otp: string): Promise<void> {
  const record: StoredOtp = { hash: await hashOtp(otp), attempts: 0 }
  await getRedis().set(REDIS_KEYS.otp, record, { ex: OTP_TTL_SECONDS })
}

// Generates a fresh OTP, persists only its hash, and returns the plaintext so
// the caller can email it. The plaintext is never stored or logged.
export async function generateAndStore(): Promise<string> {
  const otp = generateOtp()
  await storeOtp(otp)
  return otp
}

export type OtpResult = "valid" | "invalid" | "expired" | "too_many_attempts"

// Verifies a submitted OTP in constant time, tracking attempts and clearing the
// record once it is consumed or exhausted.
export async function verifyOtp(otp: string): Promise<OtpResult> {
  const redis = getRedis()
  const record = await redis.get<StoredOtp>(REDIS_KEYS.otp)
  if (!record) return "expired"

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(REDIS_KEYS.otp)
    return "too_many_attempts"
  }

  const submittedHash = await hashOtp(otp)
  if (timingSafeEqual(submittedHash, record.hash)) {
    await redis.del(REDIS_KEYS.otp)
    return "valid"
  }

  const attempts = record.attempts + 1
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(REDIS_KEYS.otp)
    return "too_many_attempts"
  }
  // Preserve remaining TTL while bumping the attempt count.
  const ttl = await redis.ttl(REDIS_KEYS.otp)
  await redis.set(REDIS_KEYS.otp, { ...record, attempts }, { ex: ttl > 0 ? ttl : OTP_TTL_SECONDS })
  return "invalid"
}

// Issues a one-time reset ticket after successful OTP verification. The nonce is
// stored server-side and also placed in an HTTP-only cookie by the caller.
export async function issueResetTicket(): Promise<string> {
  const nonce = generateNonce()
  await getRedis().set(REDIS_KEYS.ticket, nonce, { ex: TICKET_TTL_SECONDS })
  return nonce
}

export async function consumeResetTicket(nonce: string | undefined): Promise<boolean> {
  if (!nonce) return false
  const redis = getRedis()
  const stored = await redis.get<string>(REDIS_KEYS.ticket)
  if (!stored || !timingSafeEqual(stored, nonce)) return false
  await redis.del(REDIS_KEYS.ticket)
  return true
}

export function getIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "unknown"
  return `staff:${ip}`
}
