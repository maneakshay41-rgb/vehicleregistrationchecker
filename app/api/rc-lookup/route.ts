import { NextResponse } from "next/server"
import { parseRcResponse } from "@/lib/parse-rc"
import type { RcLookupResponse } from "@/lib/vehicle-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json<RcLookupResponse>({ ok: false, error: message }, { status })
}

export async function POST(request: Request) {
  const apiUrl = process.env.VEHICLE_API_URL
  const apiKey = process.env.VEHICLE_API_KEY

  if (!apiUrl || !apiKey) {
    return jsonError("Vehicle lookup service is not configured.", 500)
  }

  let vehicleNumber = ""
  try {
    const body = (await request.json()) as { vehicleNumber?: unknown }
    vehicleNumber = String(body?.vehicleNumber ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
  } catch {
    return jsonError("Invalid request body.", 400)
  }

  if (!/^[A-Z0-9]{6,12}$/.test(vehicleNumber)) {
    return jsonError("Please enter a valid vehicle registration number.", 400)
  }

  let providerResponse: Response
  try {
    providerResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        key: apiKey,
        id_number: vehicleNumber,
      }),
      cache: "no-store",
    })
  } catch {
    return jsonError("Unable to reach the vehicle lookup service. Please try again.", 502)
  }

  if (!providerResponse.ok) {
    return jsonError("The vehicle lookup service returned an error. Please try again.", 502)
  }

  let payload: unknown
  try {
    payload = await providerResponse.json()
  } catch {
    return jsonError("Received an unreadable response from the lookup service.", 502)
  }

  const data = parseRcResponse(payload)
  if (!data || !data.rc_number) {
    return jsonError("No vehicle details found for that registration number.", 404)
  }

  return NextResponse.json<RcLookupResponse>({ ok: true, data })
}
