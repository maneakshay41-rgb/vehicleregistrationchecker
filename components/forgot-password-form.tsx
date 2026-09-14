"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type Step = "request" | "verify" | "reset"

const inputClass =
  "rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

export function ForgotPasswordForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("request")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function postJson(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    return { ok: res.ok && payload.ok === true, error: payload.error }
  }

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault()
    if (loading) return
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const { ok, error } = await postJson("/api/forgot-password/request", {})
      if (ok) {
        setStep("verify")
        setNotice("A reset code has been sent to the registered administrator email.")
      } else {
        setError(error ?? "Could not send the reset code.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code.")
      return
    }
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const { ok, error } = await postJson("/api/forgot-password/verify", { code: code.trim() })
      if (ok) {
        setStep("reset")
      } else {
        setError(error ?? "Incorrect code.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const { ok, error } = await postJson("/api/forgot-password/reset", {
        password,
        confirmPassword,
      })
      if (ok) {
        router.replace("/login")
        router.refresh()
      } else {
        setError(error ?? "Could not reset the password.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      {notice !== "" && (
        <p className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {step === "request" && (
        <form onSubmit={requestCode} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground text-pretty">
            Click below to receive a 6-digit verification code. The code expires in 10 minutes.
          </p>
          <Button type="submit" disabled={loading} className="h-auto w-full py-3 text-base">
            {loading ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      )}

      {step === "verify" && (
        <form onSubmit={verifyCode} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="code" className="text-sm font-medium text-foreground">
              Verification code
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className={`${inputClass} text-center text-lg tracking-[0.5em]`}
            />
          </div>
          <Button type="submit" disabled={loading} className="h-auto w-full py-3 text-base">
            {loading ? "Verifying…" : "Verify code"}
          </Button>
          <button
            type="button"
            onClick={() => requestCode()}
            disabled={loading}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
          >
            Resend code
          </button>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={resetPassword} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <Button type="submit" disabled={loading} className="h-auto w-full py-3 text-base">
            {loading ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}

      {error !== "" && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <Link
        href="/login"
        className="text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  )
}
