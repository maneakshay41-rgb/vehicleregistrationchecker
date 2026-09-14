// Server-only password + OTP hashing helpers built on Web Crypto so they run
// in both Node and Edge runtimes. No plaintext secret ever leaves the server.

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set")
  return secret
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Constant-time string comparison to avoid leaking match position via timing.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

const PBKDF2_ITERATIONS = 100_000

// Produces "pbkdf2$<iterations>$<saltB64>$<hashB64>". Safe to store at rest.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, hashB64] = stored.split("$")
  if (scheme !== "pbkdf2" || !iterationsRaw || !saltB64 || !hashB64) return false

  const iterations = Number.parseInt(iterationsRaw, 10)
  if (!Number.isFinite(iterations)) return false

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  )
  return timingSafeEqual(toBase64(new Uint8Array(bits)), hashB64)
}

// Keyed hash of an OTP, using SESSION_SECRET as the pepper. Only the hash is
// stored, never the plaintext code.
export async function hashOtp(otp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(otp))
  return toHex(new Uint8Array(signature))
}

// Cryptographically strong 6-digit numeric code.
export function generateOtp(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return (array[0] % 1_000_000).toString().padStart(6, "0")
}

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toHex(bytes)
}
