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
