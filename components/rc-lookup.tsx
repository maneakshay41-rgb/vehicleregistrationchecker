"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RcResult } from "@/components/rc-result"
import type { RcLookupResponse, VehicleRcData } from "@/lib/vehicle-types"

export function RcLookup() {
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<VehicleRcData | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return

    const trimmed = vehicleNumber.trim()
    if (trimmed === "") {
      setError("Please enter a vehicle registration number.")
      return
    }

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const res = await fetch("/api/rc-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleNumber: trimmed }),
      })
      const payload = (await res.json()) as RcLookupResponse
      if (payload.ok) {
        setResult(payload.data)
      } else {
        setError(payload.error)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="vehicleNumber" className="sr-only">
          Vehicle registration number
        </label>
        <input
          id="vehicleNumber"
          name="vehicleNumber"
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
          placeholder="e.g. MH12AB1234"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 rounded-lg border border-input bg-background px-4 py-3 font-mono text-base tracking-widest text-foreground outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={loading} className="h-auto px-6 py-3 text-base">
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {error !== "" && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {result && <RcResult data={result} />}
    </div>
  )
}
