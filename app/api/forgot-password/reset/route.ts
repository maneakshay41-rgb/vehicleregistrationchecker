import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth"
import { bumpSessionEpoch, getRedis, REDIS_KEYS } from "@/lib/redis"
import { hashPassword } from "@/lib/password"
import { consumeResetTicket, RESET_TICKET_COOKIE, resetTicketCookieOptions } from "@/lib/reset"
import { cookies } from "next/headers"

const MIN_PASSWORD_LENGTH = 8

export async function POST(request: Request) {
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500 })
  }

  let password = ""
  let confirm = ""
  try {
    const body = (await request.json()) as { password?: unknown; confirmPassword?: unknown }
    password = typeof body.password === "string" ? body.password : ""
    confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : ""
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    )
  }
  if (password !== confirm) {
    return NextResponse.json({ ok: false, error: "Passwords do not match." }, { status: 400 })
  }

  const cookieStore = await cookies()
  const ticket = cookieStore.get(RESET_TICKET_COOKIE)?.value

  try {
    const ticketValid = await consumeResetTicket(ticket)
    if (!ticketValid) {
      return NextResponse.json(
        { ok: false, error: "Your reset session has expired. Please start again." },
        { status: 401 },
      )
    }

    // Persist the new password hash and invalidate every existing session.
    await getRedis().set(REDIS_KEYS.passwordHash, await hashPassword(password))
    await bumpSessionEpoch()

    const response = NextResponse.json({ ok: true })
    // Clear the current session and the one-time reset ticket.
    response.cookies.set(SESSION_COOKIE, "", { ...resetTicketCookieOptions, maxAge: 0, httpOnly: true })
    response.cookies.set(RESET_TICKET_COOKIE, "", { ...resetTicketCookieOptions, maxAge: 0 })
    return response
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reset the password. Please try again." },
      { status: 503 },
    )
  }
}
