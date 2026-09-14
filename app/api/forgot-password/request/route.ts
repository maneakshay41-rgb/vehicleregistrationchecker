import { NextResponse } from "next/server"
import { Resend } from "resend"
import { checkSendAllowed, getIdentifier, generateAndStore } from "@/lib/reset"

export async function POST(request: Request) {
  const adminEmail = process.env.PASSWORD_RESET_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "Password reset is not configured. Please contact the administrator." },
      { status: 500 },
    )
  }

  const identifier = getIdentifier(request)

  let gate
  try {
    gate = await checkSendAllowed(identifier)
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to start password reset right now. Please try again later." },
      { status: 503 },
    )
  }

  if (!gate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Please wait ${gate.retryAfterSeconds ?? 60}s before requesting another code.`,
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds ?? 60) } },
    )
  }

  const otp = await generateAndStore()

  const resend = new Resend(apiKey)
  const domain = process.env.RESEND_EMAIL_DOMAIN
  const from = domain ? `Vehicle RC Checker <no-reply@${domain}>` : "Vehicle RC Checker <onboarding@resend.dev>"

  const { error } = await resend.emails.send({
    from,
    to: [adminEmail],
    subject: "Your password reset code",
    html: otpEmailHtml(otp),
    text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
  })

  if (error) {
    console.error("[v0] Resend send failed:", error.message)
    return NextResponse.json(
      { ok: false, error: "Could not send the reset code. Please try again." },
      { status: 502 },
    )
  }

  // Never reveal the destination address to the client.
  return NextResponse.json({ ok: true })
}

function otpEmailHtml(otp: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h1 style="font-size:18px;margin:0 0 8px">Password reset code</h1>
    <p style="color:#555;font-size:14px;margin:0 0 20px">
      Use the code below to reset the staff account password. It expires in 10 minutes.
    </p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
      background:#f4f4f5;border-radius:10px;padding:16px 0;color:#111">${otp}</div>
    <p style="color:#888;font-size:12px;margin:20px 0 0">
      If you did not request this, you can safely ignore this email.
    </p>
  </div>`
}
