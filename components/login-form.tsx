"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type Phase = "form" | "pending"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [phase, setPhase] = useState<Phase>("form")
  const pollStartRef = useRef(0)

  // While waiting for admin approval, poll the server for the decision. The
  // session is minted server-side; here we only react to the resulting status.
  useEffect(() => {
    if (phase !== "pending") return
    let active = true
    pollStartRef.current = Date.now()

    const interval = setInterval(async () => {
      // Give up after the 10 minute approval window (plus a small buffer).
      if (Date.now() - pollStartRef.current > 11 * 60 * 1000) {
        if (!active) return
        clearInterval(interval)
        setPhase("form")
        setPassword("")
        setNotice("Your approval request timed out. Please sign in again.")
        return
      }

      try {
        const res = await fetch("/api/login-approval/status", { cache: "no-store" })
        const data = (await res.json()) as { status?: string }
        if (!active) return

        if (data.status === "approved") {
          clearInterval(interval)
          router.replace("/")
          router.refresh()
        } else if (data.status === "rejected") {
          clearInterval(interval)
          setPhase("form")
          setPassword("")
          setNotice("Your login was rejected by the administrator. Please try again.")
        } else if (data.status === "expired" || data.status === "none") {
          clearInterval(interval)
          setPhase("form")
          setPassword("")
          setNotice("Your approval request expired. Please sign in again.")
        }
        // "pending" → keep waiting
      } catch {
        // Ignore transient network errors and keep polling.
      }
    }, 3000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [phase, router])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return

    if (email.trim() === "" || password === "") {
      setError("Please enter your email and password.")
      return
    }

    setLoading(true)
    setError("")
    setNotice("")

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const payload = (await res.json()) as { ok: boolean; status?: string; error?: string }
      if (payload.ok) {
        // Credentials accepted — now waiting for mandatory admin approval.
        setPhase("pending")
      } else {
        setError(payload.error ?? "Unable to sign in.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function cancelPending() {
    setPhase("form")
    setPassword("")
    setNotice("Login approval cancelled. You can sign in again when ready.")
  }

  if (phase === "pending") {
    return (
      <div
        className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-6 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-semibold text-foreground">Waiting for admin approval…</p>
          <p className="text-sm text-muted-foreground text-pretty">
            An approval request has been sent to the administrator. You&apos;ll continue
            automatically once it&apos;s approved. This request expires in 10 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={cancelPending}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      {notice !== "" && (
        <p className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email or username
        </label>
        <input
          id="email"
          name="email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="h-auto w-full py-3 text-base">
        {loading ? "Signing in…" : "Log in"}
      </Button>
    </form>
  )
}
