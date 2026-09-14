import { NextResponse } from "next/server"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth"
import { getSessionEpoch } from "@/lib/redis"
import {
  LOGIN_PENDING_COOKIE,
  clearedPendingCookieOptions,
  discardApproval,
  finalizeApproved,
  readApprovalStatus,
} from "@/lib/login-approval"

// Polled by the staff login screen while it waits for the admin decision. The
// authenticated session is minted HERE, server-side, and ONLY once the request
// has been approved — valid credentials alone can never reach this state.
export async function GET(request: Request) {
  const id = readPendingCookie(request)

  let status
  try {
    status = await readApprovalStatus(id)
  } catch {
    // Transient storage error: report as still pending so the client keeps
    // polling instead of failing the login outright.
    return NextResponse.json({ status: "pending" })
  }

  if (status === "pending") {
    return NextResponse.json({ status: "pending" })
  }

  if (status === "expired") {
    const res = NextResponse.json({ status: "expired" })
    res.cookies.set(LOGIN_PENDING_COOKIE, "", clearedPendingCookieOptions)
    return res
  }

  if (status === "rejected") {
    try {
      await discardApproval(id)
    } catch {
      // best-effort cleanup
    }
    const res = NextResponse.json({ status: "rejected" })
    res.cookies.set(LOGIN_PENDING_COOKIE, "", clearedPendingCookieOptions)
    return res
  }

  // status === "approved": consume the request and mint the session.
  let email: string | null = null
  try {
    email = await finalizeApproved(id)
  } catch {
    email = null
  }

  const res = NextResponse.json({ status: "approved" })
  res.cookies.set(LOGIN_PENDING_COOKIE, "", clearedPendingCookieOptions)

  if (email) {
    let epoch = 0
    try {
      epoch = await getSessionEpoch()
    } catch {
      epoch = 0
    }
    const token = await createSessionToken(email, epoch)
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  }

  return res
}

function readPendingCookie(request: Request): string | undefined {
  const cookie = request.headers.get("cookie")
  if (!cookie) return undefined
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === LOGIN_PENDING_COOKIE) return decodeURIComponent(rest.join("="))
  }
  return undefined
}
