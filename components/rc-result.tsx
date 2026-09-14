import type { VehicleRcData } from "@/lib/vehicle-types"

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
  if (s.includes("active") || s.includes("valid")) {
    return "bg-primary text-primary-foreground"
  }
  return "bg-secondary text-secondary-foreground"
}

export function RcResult({ data }: { data: VehicleRcData }) {
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
          {data.rc_status.trim() !== "" && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(data.rc_status)}`}
            >
              {data.rc_status}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground text-pretty">
          {[data.maker_description, data.maker_model, data.variant]
            .filter((v) => v.trim() !== "")
            .join(" · ") || "Vehicle details"}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-x-8 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="Owner name" value={data.owner_name} />
        <Field label="Mobile number" value={data.mobile_number} />
        <Field label="Registration date" value={data.registration_date} />
        <Field label="Registered at" value={data.registered_at} />
        <Field label="RTO code" value={data.rto_code} />
        <Field label="Maker" value={data.maker_description} />
        <Field label="Model" value={data.maker_model} />
        <Field label="Variant" value={data.variant} />
        <Field label="Fuel type" value={data.fuel_type} />
        <Field label="Body type" value={data.body_type} />
        <Field label="Insurance company" value={data.insurance_company} />
        <Field label="Insurance valid upto" value={data.insurance_upto} />
        <Field label="PUCC valid upto" value={data.pucc_upto} />
      </dl>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Challan details{" "}
          <span className="font-normal text-muted-foreground">
            ({data.challan_details.length})
          </span>
        </h2>
        {data.challan_details.length === 0 ? (
          <p className="text-sm text-muted-foreground">No challans found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.challan_details.map((challan, index) => (
              <li
                key={challan.challan_number || index}
                className="flex flex-col gap-2 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {challan.challan_number || "—"}
                  </span>
                  {challan.status.trim() !== "" && (
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {challan.status}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date: </span>
                    <span className="text-foreground">{challan.challan_date || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount: </span>
                    <span className="text-foreground">{challan.amount || "—"}</span>
                  </div>
                </div>
                {challan.offences.length > 0 && (
                  <p className="text-sm text-muted-foreground text-pretty">
                    {challan.offences.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
