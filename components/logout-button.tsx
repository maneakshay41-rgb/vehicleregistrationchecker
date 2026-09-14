"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    if (loading) return
    setLoading(true)
    try {
      await fetch("/api/logout", { method: "POST" })
      router.replace("/login")
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={loading}>
      {loading ? "Logging out…" : "Log out"}
    </Button>
  )
}
