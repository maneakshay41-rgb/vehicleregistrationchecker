import { NextResponse } from "next/server"
import {
  checkVerifyAllowed,
  consumeResetTicket,
  getIdentifier,
  issueResetTicket,
  RESET_TICKET_COOKIE,
  resetTicketCookieOptions,
  verifyOtp,
} from "@/lib/reset"

export async function POST(request: Request) {
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500 })
  }

  let code = ""
  try {
    const body = (await request.json()) as { code?: unknown }
    code = typeof body.code === "string" ? body.code.trim() : ""
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit code." }, { status: 400 })
  }

  const identifier = getIdentifier(request)

  try {
    const allowed = await checkVerifyAllowed(identifier)
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please request a new code later." },
        { status: 429 },
      )
    }

    const result = await verifyOtp(code)
    if (result === "valid") {
      const nonce = await issueResetTicket()
      const response = NextResponse.json({ ok: true })
      response.cookies.set(RESET_TICKET_COOKIE, nonce, resetTicketCookieOptions)
      return response
    }

    const message =
      result === "expired"
        ? "This code has expired. Please request a new one."
        : result === "too_many_attempts"
          ? "Too many incorrect attempts. Please request a new code."
          : "Incorrect code. Please try again."
    // Defensive: clear any stale ticket on a failed verification.
    await consumeResetTicket(undefined)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  } catch {
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 503 },
    )
  }
}
