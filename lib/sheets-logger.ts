import "server-only"

/**
 * Sends a single RC lookup's ORIGINAL API response to a Google Apps Script
 * Web App, which appends it as a new row in the "RC Lookup Data" worksheet.
 *
 * This runs entirely server-side. The webhook URL and the raw API payload are
 * never exposed to the browser. A logging failure must never break the lookup
 * response, so all errors are swallowed after being logged on the server.
 */
export async function logRcLookupToSheet(params: {
  rcNumber: string
  payload: unknown
}): Promise<void> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL
  if (!webhookUrl) {
    console.log("[v0] Sheets logging skipped: GOOGLE_SHEETS_WEBHOOK_URL is not set")
    return
  }

  // The Apps Script "/dev" URL only serves the latest code to the logged-in
  // owner and returns a 401 sign-in page to anonymous server requests, so it
  // can never work as a webhook. Only the published "/exec" deployment honors
  // "Who has access: Anyone". Warn loudly instead of failing silently.
  if (/\/dev\/?$/.test(webhookUrl.trim())) {
    console.log(
      "[v0] Sheets logging misconfigured: GOOGLE_SHEETS_WEBHOOK_URL ends in '/dev'. " +
        "Use the published Web App '/exec' URL instead.",
    )
  }

  const body = JSON.stringify({
    // ISO 8601 timestamp of the lookup.
    lookupDateTime: new Date().toISOString(),
    rcNumber: params.rcNumber,
    // The complete, unmodified original API response — not masked Staff View data.
    data: params.payload,
  })

  // Guard against a slow/unresponsive Apps Script endpoint holding the request.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    })

    if (!res.ok) {
      console.log(`[v0] Sheets logging failed with status ${res.status}`)
      return
    }

    // A working Apps Script doPost replies with JSON (e.g. {"ok":true}).
    // If the deployment is not accessible to "Anyone", Google returns an
    // HTML sign-in/permission page with a 200 status instead — the request
    // never reaches doPost, so nothing is appended. Detect that here so the
    // silent failure is visible in server logs.
    const contentType = res.headers.get("content-type") ?? ""
    const text = await res.text()
    const looksLikeHtml =
      contentType.includes("text/html") || /^\s*<(?:!doctype|html)/i.test(text)

    if (looksLikeHtml) {
      console.log(
        "[v0] Sheets logging failed: webhook returned an HTML page (likely a Google " +
          "sign-in/permission screen). Redeploy the Apps Script Web App with " +
          '"Execute as: Me" and "Who has access: Anyone".',
      )
      return
    }

    let ok = false
    try {
      ok = (JSON.parse(text) as { ok?: unknown })?.ok === true
    } catch {
      ok = false
    }
    if (!ok) {
      console.log("[v0] Sheets logging: webhook did not confirm success (no {ok:true}).")
    }
  } catch (error) {
    // Never surface details to the caller; only log server-side.
    console.log(
      "[v0] Sheets logging error:",
      error instanceof Error ? error.message : "unknown error",
    )
  } finally {
    clearTimeout(timeout)
  }
}
