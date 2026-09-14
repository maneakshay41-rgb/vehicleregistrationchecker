import { NextResponse } from "next/server"
import { Resend } from "resend"
import { getRedis, REDIS_KEYS } from "@/lib/redis"
import { timingSafeEqual, verifyPassword } from "@/lib/password"
import {
  LOGIN_PENDING_COOKIE,
  checkApprovalSendAllowed,
  createApproval,
  discardApproval,
  findActivePending,
  loginPendingCookieOptions,
} from "@/lib/login-approval"

export async function POST(request: Request) {
  const expectedEmail = process.env.STAFF_LOGIN_EMAIL
  const expectedPassword = process.env.STAFF_LOGIN_PASSWORD

  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "Login is not configured. Please contact the administrator." },
      { status: 500 },
    )
  }

  // Admin approval is mandatory, so the approval email transport must be
  // configured. Fail closed if it is not — valid credentials must never be
  // enough on their own.
  const adminEmail = process.env.PASSWORD_RESET_EMAIL
  const resendApiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !resendApiKey) {
    return NextResponse.json(
      { ok: false, error: "Login approval is not configured. Please contact the administrator." },
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

  // Credentials are valid, but NO session is created here. Instead an admin
  // approval request is opened and the caller must wait for approval.
  const staffEmail = expectedEmail.trim()
  const ip = clientIp(request)

  // Duplicate protection: reuse an already-open pending request for this account
  // rather than creating another one and emailing the admin again.
  try {
    const existing = await findActivePending(staffEmail)
    if (existing) {
      const res = NextResponse.json({ ok: true, status: "pending" })
      res.cookies.set(LOGIN_PENDING_COOKIE, existing, loginPendingCookieOptions)
      return res
    }
  } catch {
    // If the lookup fails, fall through and attempt to create a fresh request.
  }

  // Throttle how often approval emails can be sent.
  try {
    const gate = await checkApprovalSendAllowed(`login-approval:${ip}`)
    if (!gate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Please wait ${gate.retryAfterSeconds ?? 60}s before trying to sign in again.`,
        },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds ?? 60) } },
      )
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to start login approval right now. Please try again later." },
      { status: 503 },
    )
  }

  let id = ""
  let token = ""
  try {
    const created = await createApproval(staffEmail, ip)
    id = created.id
    token = created.token
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to start login approval right now. Please try again later." },
      { status: 503 },
    )
  }

  const origin = requestOrigin(request)
  const approveUrl = `${origin}/api/login-approval/action?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&decision=approve`
  const rejectUrl = `${origin}/api/login-approval/action?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&decision=reject`

  const resend = new Resend(resendApiKey)
  const domain = process.env.RESEND_EMAIL_DOMAIN
  const from = domain
    ? `Vehicle RC Checker <no-reply@${domain}>`
    : "Vehicle RC Checker <onboarding@resend.dev>"

  const { error } = await resend.emails.send({
    from,
    to: [adminEmail],
    subject: "Vehicle Checker – Login Approval Required",
    html: approvalEmailHtml({ staffEmail, ip, approveUrl, rejectUrl }),
    text:
      `A staff login approval is required.\n\n` +
      `Account: ${staffEmail}\n` +
      `Requested: ${new Date().toUTCString()}\n` +
      `IP address: ${ip}\n\n` +
      `Approve: ${approveUrl}\n` +
      `Reject: ${rejectUrl}\n\n` +
      `This request expires in 10 minutes. If you did not expect this, reject it.`,
  })

  if (error) {
    console.error("[v0] Login approval email failed:", error.message)
    try {
      await discardApproval(id)
    } catch {
      // best-effort cleanup
    }
    return NextResponse.json(
      { ok: false, error: "Could not request login approval. Please try again." },
      { status: 502 },
    )
  }

  const res = NextResponse.json({ ok: true, status: "pending" })
  res.cookies.set(LOGIN_PENDING_COOKIE, id, loginPendingCookieOptions)
  return res
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(a, b)
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : ""
  return ip || "unknown"
}

function requestOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https"
  const host = request.headers.get("host")
  if (host) return `${proto}://${host}`
  return new URL(request.url).origin
}

function approvalEmailHtml(params: {
  staffEmail: string
  ip: string
  approveUrl: string
  rejectUrl: string
}): string {
  const { staffEmail, ip, approveUrl, rejectUrl } = params
  const requestedAt = new Date().toUTCString()
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h1 style="font-size:18px;margin:0 0 8px;color:#111">Login approval required</h1>
    <p style="color:#555;font-size:14px;margin:0 0 20px;line-height:1.6">
      A staff sign-in attempt is waiting for your approval. Approve it only if you recognise this activity.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;margin:0 0 24px">
      <tr><td style="padding:6px 0;color:#888">Account</td><td style="padding:6px 0;text-align:right">${staffEmail}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Requested</td><td style="padding:6px 0;text-align:right">${requestedAt}</td></tr>
      <tr><td style="padding:6px 0;color:#888">IP address</td><td style="padding:6px 0;text-align:right">${ip}</td></tr>
    </table>
    <div style="display:flex;gap:12px">
      <a href="${approveUrl}" style="flex:1;text-decoration:none;text-align:center;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 16px;border-radius:10px">Approve Login</a>
      <a href="${rejectUrl}" style="flex:1;text-decoration:none;text-align:center;background:#dc2626;color:#fff;font-weight:600;font-size:14px;padding:12px 16px;border-radius:10px">Reject Login</a>
    </div>
    <p style="color:#888;font-size:12px;margin:24px 0 0;line-height:1.6">
      This request expires in 10 minutes and can be used only once. If you did not expect this, reject it or ignore this email.
    </p>
  </div>`
}
