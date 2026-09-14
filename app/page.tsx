import { RcLookup } from "@/components/rc-lookup"

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Vehicle RC Lookup
        </span>
        <h1 className="text-3xl font-semibold text-balance text-foreground sm:text-4xl">
          Check any vehicle&apos;s registration details
        </h1>
        <p className="text-base text-muted-foreground text-pretty">
          Enter a registration number to fetch owner, insurance, PUCC, RTO and challan
          information.
        </p>
      </header>

      <RcLookup />
    </main>
  )
}
