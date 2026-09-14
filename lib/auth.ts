// Server-only session utilities. Uses Web Crypto (HMAC-SHA256) so the same
// code runs in both the Node runtime (route handlers) and the Edge runtime
// (middleware). No secrets are ever sent to the client.

export const SESSION_COOKIE = "rc_session"
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not set")
  }
  return secret
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function sign(data: string): Promise<string> {
  const key = await importKey()
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return base64UrlEncode(new Uint8Array(signature))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

interface SessionPayload {
  sub: string
  exp: number
}

export async function createSessionToken(email: string): Promise<string> {
  const payload: SessionPayload = {
    sub: email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  }
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [encodedPayload, signature] = token.split(".")
  if (!encodedPayload || !signature) return false

  const expectedSignature = await sign(encodedPayload)
  if (!timingSafeEqual(signature, expectedSignature)) return false

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    ) as SessionPayload
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
}
