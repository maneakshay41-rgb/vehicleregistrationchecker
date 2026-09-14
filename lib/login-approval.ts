import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/redis"
import { generateNonce, hashOtp, timingSafeEqual } from "@/lib/password"

// Server-only. Implements the mandatory admin approval gate that sits between a
// valid staff credential check and the creation of an authenticated session.
// No plaintext token is ever stored: only a keyed hash lives in Redis, and the
// plaintext is emailed to the admin as a single-use capability link.

export const LOGIN_APPROVAL_TTL_SECONDS = 10 * 60 // 10 minutes
export const LOGIN_PENDING_COOKIE = "rc_login_pending"

export const loginPendingCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: LOGIN_APPROVAL_TTL_SECONDS,
}

export const clearedPendingCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
}

export type ApprovalStatus = "pending" | "approved" | "rejected"

interface ApprovalRecord {
  email: string
  ip: string
  createdAt: number
  status: ApprovalStatus
  tokenHash: string
}

function reqKey(id: string): string {
  return `login_approval:req:${id}`
}

function currentKey(pointer: string): string {
  return `login_approval:current:${pointer}`
}

// Keyed hash so the raw email address is never used directly as a Redis key.
async function emailPointerKey(email: string): Promise<string> {
  return (await hashOtp(`login-approval-pointer:${email.toLowerCase()}`)).slice(0, 40)
}

// --- rate limiting: at most one approval email per minute, capped per window ---
let cooldownLimiter: Ratelimit | null = null
let capLimiter: Ratelimit | null = null

function getCooldownLimiter(): Ratelimit {
  if (!cooldownLimiter) {
    cooldownLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.fixedWindow(1, "60 s"),
      prefix: "rl:login-approval:cooldown",
    })
  }
  return cooldownLimiter
}

function getCapLimiter(): Ratelimit {
  if (!capLimiter) {
    capLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:login-approval:cap",
    })
  }
  return capLimiter
}

export interface SendCheck {
  allowed: boolean
  retryAfterSeconds?: number
}

export async function checkApprovalSendAllowed(identifier: string): Promise<SendCheck> {
  const cooldown = await getCooldownLimiter().limit(identifier)
  if (!cooldown.success) return { allowed: false, retryAfterSeconds: retryAfter(cooldown.reset) }
  const cap = await getCapLimiter().limit(identifier)
  if (!cap.success) return { allowed: false, retryAfterSeconds: retryAfter(cap.reset) }
  return { allowed: true }
}

function retryAfter(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

// Returns the id of an existing still-pending approval for this email, if any,
// so a repeated login attempt reuses the open request instead of creating a
// duplicate and emailing the admin again.
export async function findActivePending(email: string): Promise<string | null> {
  const redis = getRedis()
  const pointer = await redis.get<string>(currentKey(await emailPointerKey(email)))
  if (!pointer) return null
  const record = await redis.get<ApprovalRecord>(reqKey(pointer))
  if (!record || record.status !== "pending") return null
  return pointer
}

// Creates a new pending approval request. Returns the id (stored in the staff
// member's HTTP-only cookie) and the plaintext single-use token (emailed to the
// admin, never persisted in plaintext).
export async function createApproval(
  email: string,
  ip: string,
): Promise<{ id: string; token: string }> {
  const id = generateNonce()
  const token = generateNonce()
  const record: ApprovalRecord = {
    email,
    ip,
    createdAt: Date.now(),
    status: "pending",
    tokenHash: await hashOtp(token),
  }
  const redis = getRedis()
  await redis.set(reqKey(id), record, { ex: LOGIN_APPROVAL_TTL_SECONDS })
  await redis.set(currentKey(await emailPointerKey(email)), id, { ex: LOGIN_APPROVAL_TTL_SECONDS })
  return { id, token }
}

export type ResolveResult = "approved" | "rejected" | "invalid" | "expired" | "already"

// Admin decision. Validates the single-use token in constant time, refuses to
// act on an already-resolved request (replay protection), and records the
// decision while preserving the remaining TTL so the staff poll can still read
// it before it expires.
export async function resolveApproval(
  id: string,
  token: string,
  decision: "approve" | "reject",
): Promise<ResolveResult> {
  if (!id || !token) return "invalid"
  const redis = getRedis()
  const record = await redis.get<ApprovalRecord>(reqKey(id))
  if (!record) return "expired"
  if (record.status !== "pending") return "already"

  const submitted = await hashOtp(token)
  if (!timingSafeEqual(submitted, record.tokenHash)) return "invalid"

  const ttl = await redis.ttl(reqKey(id))
  const nextStatus: ApprovalStatus = decision === "approve" ? "approved" : "rejected"
  await redis.set(
    reqKey(id),
    { ...record, status: nextStatus },
    { ex: ttl > 0 ? ttl : LOGIN_APPROVAL_TTL_SECONDS },
  )
  return nextStatus
}

export async function readApprovalStatus(
  id: string | undefined,
): Promise<ApprovalStatus | "expired"> {
  if (!id) return "expired"
  const record = await getRedis().get<ApprovalRecord>(reqKey(id))
  if (!record) return "expired"
  return record.status
}

// Consumes an approved request: returns the staff email a session should be
// minted for, then deletes the record and pointer so the approval is strictly
// single-use and cannot be replayed.
export async function finalizeApproved(id: string | undefined): Promise<string | null> {
  if (!id) return null
  const redis = getRedis()
  const record = await redis.get<ApprovalRecord>(reqKey(id))
  if (!record || record.status !== "approved") return null
  await redis.del(reqKey(id))
  await redis.del(currentKey(await emailPointerKey(record.email)))
  return record.email
}

// Discards a request (on reject or expiry) so the record and pointer are cleared.
export async function discardApproval(id: string | undefined): Promise<void> {
  if (!id) return
  const redis = getRedis()
  const record = await redis.get<ApprovalRecord>(reqKey(id))
  await redis.del(reqKey(id))
  if (record) await redis.del(currentKey(await emailPointerKey(record.email)))
}
