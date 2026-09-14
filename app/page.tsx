import { RcLookup } from "@/components/rc-lookup"
import { LogoutButton } from "@/components/logout-button"

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vehicle Status & Last Trip
          </span>
          <LogoutButton />
        </div>
        <h1 className="text-3xl font-semibold text-balance text-foreground sm:text-4xl">
          Check Vehicle Status &amp; Last Trip
        </h1>
        <p className="text-base text-muted-foreground text-pretty">
          Enter a registration number to check vehicle status and last trip details.
        </p>
      </header>

      <RcLookup />
    </main>
  )
}
