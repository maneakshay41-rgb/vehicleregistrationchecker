import { ForgotPasswordForm } from "@/components/forgot-password-form"

export const metadata = {
  title: "Reset password — Vehicle Status & Last Trip",
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Staff Access
          </span>
          <h1 className="text-2xl font-semibold text-balance text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            We&apos;ll email a one-time code to the registered administrator address.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
