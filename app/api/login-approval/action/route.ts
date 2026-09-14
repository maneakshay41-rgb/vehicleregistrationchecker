import { NextResponse } from "next/server"
import { resolveApproval } from "@/lib/login-approval"

// Admin-facing endpoint hit by the Approve/Reject links in the approval email.
// It is intentionally unauthenticated (the admin has no staff session) but is
// protected by the high-entropy, single-use token bound to the request id.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id") ?? ""
  const token = url.searchParams.get("token") ?? ""
  const decisionParam = url.searchParams.get("decision")
  const decision =
    decisionParam === "approve" ? "approve" : decisionParam === "reject" ? "reject" : null

  if (!decision) {
    return htmlPage("Invalid request", "This approval link is malformed.")
  }

  let result
  try {
    result = await resolveApproval(id, token, decision)
  } catch {
    return htmlPage("Something went wrong", "Please try again in a moment.")
  }

  switch (result) {
    case "approved":
      return htmlPage(
        "Login approved",
        "The staff member can now continue to the dashboard. You can close this tab.",
      )
    case "rejected":
      return htmlPage(
        "Login rejected",
        "The login attempt has been blocked. You can close this tab.",
      )
    case "already":
      return htmlPage(
        "Already processed",
        "This login request has already been approved or rejected.",
      )
    case "expired":
      return htmlPage(
        "Link expired",
        "This approval request has expired. Ask the staff member to sign in again.",
      )
    default:
      return htmlPage("Invalid link", "This approval link is invalid.")
  }
}

function htmlPage(title: string, message: string): NextResponse {
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
  </head>
  <body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;display:flex;min-height:100vh;align-items:center;justify-content:center">
    <div style="max-width:420px;margin:24px;padding:32px;background:#ffffff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center">
      <h1 style="font-size:20px;margin:0 0 12px;color:#111">${title}</h1>
      <p style="font-size:14px;line-height:1.6;color:#555;margin:0">${message}</p>
    </div>
  </body>
</html>`
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  })
}
