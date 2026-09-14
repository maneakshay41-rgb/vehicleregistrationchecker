import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, parseSessionToken } from "@/lib/auth"
import { getSessionEpoch } from "@/lib/redis"

const PUBLIC_PAGES = ["/login", "/forgot-password"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await parseSessionToken(token)

  let isAuthed = session !== null
  // Enforce session invalidation: a reset bumps the epoch, so tokens minted
  // before it no longer match. If Redis is unreachable, fall back to the
  // signature/expiry check so a transient outage can't lock everyone out.
  if (isAuthed && session) {
    try {
      const epoch = await getSessionEpoch()
      if (session.sv !== epoch) isAuthed = false
    } catch {
      // keep isAuthed based on signature + expiry only
    }
  }

  if (PUBLIC_PAGES.includes(pathname)) {
    if (isAuthed) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }

  if (!isAuthed) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Protect everything except the auth API routes, Next internals and static assets.
  matcher: [
    "/((?!api/login|api/logout|api/forgot-password|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
