import type { StaffViewData } from "@/lib/vehicle-types"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground text-pretty">
        {value.trim() !== "" ? value : "—"}
      </dd>
    </div>
  )
}

function statusTone(status: string) {
  const s = status.toLowerCase()
  if (s.includes("active")) {
    return "bg-primary text-primary-foreground"
  }
  return "bg-secondary text-secondary-foreground"
}

export function RcResult({ data }: { data: StaffViewData }) {
  return (
    <section aria-label="Vehicle registration details" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Registration number
            </span>
            <span className="font-mono text-2xl font-semibold tracking-widest text-foreground">
              {data.rc_number || "—"}
            </span>
          </div>
          {data.status.trim() !== "" && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(data.status)}`}
            >
              {data.status}
            </span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-8 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="Creation date" value={data.creation_date} />
        <Field label="Status" value={data.status} />
        <Field label="Last trip date" value={data.last_trip_date} />
      </dl>
    </section>
  )
}
