import { NextResponse } from "next/server"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth"

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

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
  const passwordMatches = safeEqual(password, expectedPassword)

  if (!emailMatches || !passwordMatches) {
    return NextResponse.json(
      { ok: false, error: "Incorrect email or password." },
      { status: 401 },
    )
  }

  const token = await createSessionToken(expectedEmail)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return response
}
