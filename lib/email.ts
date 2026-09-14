import { Resend } from "resend"

// Server-only shared email sender.
//
// The project may set RESEND_EMAIL_DOMAIN to a custom sending domain, but that
// domain must be verified in Resend before it can be used as a "from" address.
// If it is not verified, Resend rejects the send with a 403 validation error.
// To stay reliable, we attempt the configured domain first and automatically
// fall back to Resend's always-available shared sender (onboarding@resend.dev)
// when the domain is not verified. Once the domain is verified in Resend, the
// primary sender is used with no code change.

const FALLBACK_FROM = "Vehicle RC Checker <onboarding@resend.dev>"

function primaryFrom(): string | null {
  const domain = process.env.RESEND_EMAIL_DOMAIN
  return domain ? `Vehicle RC Checker <no-reply@${domain}>` : null
}

function isDomainNotVerified(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes("not verified") || m.includes("domain is not verified")
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  ok: boolean
  errorMessage?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, errorMessage: "RESEND_API_KEY is not set" }

  const resend = new Resend(apiKey)
  const primary = primaryFrom()
  const payload = { to: [input.to], subject: input.subject, html: input.html, text: input.text }

  // Try the configured custom domain first, if any.
  if (primary) {
    const { error } = await resend.emails.send({ from: primary, ...payload })
    if (!error) return { ok: true }
    // Only fall back for the specific "domain not verified" failure; surface
    // anything else (e.g. invalid API key) as a real error.
    if (!isDomainNotVerified(error.message)) {
      return { ok: false, errorMessage: error.message }
    }
    console.warn(
      "[v0] Configured RESEND_EMAIL_DOMAIN is not verified in Resend; falling back to the shared sender.",
    )
  }

  const { error } = await resend.emails.send({ from: FALLBACK_FROM, ...payload })
  if (error) return { ok: false, errorMessage: error.message }
  return { ok: true }
}
