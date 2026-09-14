export interface ChallanDetail {
  challan_number: string
  challan_date: string
  amount: string
  status: string
  accused_name: string
  offences: string[]
}

export interface VehicleRcData {
  rc_number: string
  owner_name: string
  mobile_number: string
  registration_date: string
  maker_description: string
  maker_model: string
  variant: string
  fuel_type: string
  body_type: string
  insurance_company: string
  insurance_upto: string
  pucc_upto: string
  registered_at: string
  rc_status: string
  rto_code: string
  challan_details: ChallanDetail[]
}

export type RcLookupResponse =
  | { ok: true; data: VehicleRcData }
  | { ok: false; error: string }
