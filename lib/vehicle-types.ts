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

/**
 * The ONLY vehicle-related shape sent to the browser for the Staff View.
 * Contains the searched RC number plus non-sensitive, synthetic display
 * values. No owner, mobile, insurance, PUCC, RTO or raw API data is included.
 */
export interface StaffViewData {
  rc_number: string
  creation_date: string
  status: string
  last_trip_date: string
}

export type RcLookupResponse =
  | { ok: true; data: StaffViewData }
  | { ok: false; error: string }
