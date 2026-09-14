import { NextResponse } from "next/server"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth"
import { getRedis, getSessionEpoch, REDIS_KEYS } from "@/lib/redis"
import { timingSafeEqual, verifyPassword } from "@/lib/password"

export async function POST(request: Request) {
  const expectedEmail = process.env.STAFF_LOGIN_EMAIL
  const expectedPassword = process.env.STAFF_LOGIN_PASSWORD

  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "Login is not configured. Please contact the administrator." },
      { status: 500 },
    )
  }

  let email = ""
  let password = ""
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown }
    email = typeof body.email === "string" ? body.email.trim() : ""
    password = typeof body.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }

  const emailMatches = safeEqual(email.toLowerCase(), expectedEmail.trim().toLowerCase())

  // If the password has been reset, a hash is stored in Redis and takes
  // precedence over the environment password. Otherwise fall back to the env.
  let passwordMatches = false
  try {
    const storedHash = await getRedis().get<string>(REDIS_KEYS.passwordHash)
    passwordMatches = storedHash
      ? await verifyPassword(password, storedHash)
      : safeEqual(password, expectedPassword)
  } catch {
    // If Redis is unreachable, fall back to the environment password.
    passwordMatches = safeEqual(password, expectedPassword)
  }

  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 })
  }

  let epoch = 0
  try {
    epoch = await getSessionEpoch()
  } catch {
    epoch = 0
  }

  const token = await createSessionToken(expectedEmail, epoch)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return response
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(a, b)
}
