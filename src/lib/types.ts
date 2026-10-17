export type ChangeStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'void';
export type EventKind =
  | 'note'
  | 'daily_log'
  | 'message_sent'
  | 'change_sent'
  | 'change_approved'
  | 'change_declined'
  | 'change_voided'
  | 'payment_requested'
  | 'payment_received'
  | 'quote_accepted';

export interface Contractor {
  id: string;
  name: string;
  business_name: string;
  phone: string;
  etransfer_email: string | null;
  google_review_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  credentials: string | null;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  referral_token: string;
}

export interface Job {
  id: string;
  client_id: string;
  title: string;
  address: string | null;
  contract_cents: number;
  tax_rate: number;
  start_date: string | null;
  status: 'active' | 'done';
  holdback_rate: number;
  holdback_release_date: string | null;
  holdback_released_at: string | null;
  share_token: string;
  done_at: string | null;
  review_asked_at: string | null;
  review_reminded_at: string | null;
  review_received_at: string | null;
  checkin_6m_at: string | null;
  checkin_12m_at: string | null;
  photo_consent_at: string | null;
  created_at: string;
}

export interface Change {
  id: string;
  job_id: string;
  number: number;
  description: string;
  price_cents: number;
  time_added: string | null;
  status: ChangeStatus;
  approval_token: string;
  sent_at: string | null;
  approved_at: string | null;
  approved_name: string | null;
  reason: ChangeReason | null;
  trade: string | null;
  photo_path: string | null;
  created_at: string;
}

export type ChangeReason = 'client_asked' | 'found_on_site' | 'inspector';
export const REASON_LABELS: Record<ChangeReason, string> = {
  client_asked: 'Client asked',
  found_on_site: 'Found on site',
  inspector: 'Inspector',
};

export interface JobEvent {
  id: string;
  job_id: string;
  kind: EventKind;
  body: string;
  change_id: string | null;
  milestone_id: string | null;
  created_at: string;
}

/** Row returned by get_change_by_token / approve_change. */
export interface ClientChange {
  status: ChangeStatus;
  business_name: string;
  contractor_phone: string;
  client_name: string | null;
  job_title: string | null;
  job_address: string | null;
  number: number | null;
  description: string | null;
  price_cents: number | null;
  tax_rate: number | null;
  time_added: string | null;
  sent_at: string | null;
  approved_at: string | null;
  approved_name: string | null;
  reason: ChangeReason | null;
  trade: string | null;
  photo_path: string | null;
}

export type MilestoneStatus = 'upcoming' | 'requested' | 'paid';
export type PaidMethod = 'etransfer' | 'cheque' | 'cash' | 'card' | 'other';

export interface Milestone {
  id: string;
  job_id: string;
  position: number;
  title: string;
  amount_cents: number;
  due_note: string | null;
  status: MilestoneStatus;
  requested_at: string | null;
  paid_at: string | null;
  paid_method: PaidMethod | null;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  event_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'withdrawn' | 'lost';

export interface Quote {
  id: string;
  client_id: string;
  number: number;
  title: string;
  address: string | null;
  scope: string | null;
  base_cents: number;
  tax_rate: number;
  deposit_rate: number;
  valid_until: string | null;
  status: QuoteStatus;
  approval_token: string;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  job_id: string | null;
  created_at: string;
}

export interface QuoteOption {
  id: string;
  quote_id: string;
  kind: 'addon' | 'package';
  position: number;
  title: string;
  detail: string | null;
  price_cents: number;
  recommended: boolean;
  selected: boolean | null;
}

/** JSON returned by get_quote_by_token / accept_quote. */
export interface ClientQuote {
  status: QuoteStatus;
  business_name: string;
  contractor_phone: string;
  google_rating?: number | null;
  google_review_count?: number | null;
  credentials?: string | null;
  client_name?: string;
  number?: number;
  title?: string;
  address?: string | null;
  scope?: string | null;
  base_cents?: number;
  tax_rate?: number;
  deposit_rate?: number;
  valid_until?: string | null;
  expired?: boolean;
  sent_at?: string | null;
  accepted_at?: string | null;
  accepted_name?: string | null;
  options?: {
    id: string;
    kind: 'addon' | 'package';
    title: string;
    detail: string | null;
    price_cents: number;
    recommended: boolean;
    selected: boolean | null;
  }[];
}

export const PAID_METHOD_LABELS: Record<PaidMethod, string> = {
  etransfer: 'e-Transfer',
  cheque: 'Cheque',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
};

/** JSON returned by get_job_by_share_token: the client's project page. */
export interface ClientProject {
  business_name: string;
  contractor_phone: string;
  etransfer_email: string | null;
  client_name: string;
  title: string;
  address: string | null;
  status: 'active' | 'done';
  contract_cents: number;
  tax_rate: number;
  holdback_rate: number;
  changes: {
    number: number;
    description: string;
    price_cents: number;
    time_added: string | null;
    status: 'sent' | 'approved';
    sent_at: string | null;
    approved_at: string | null;
    approved_name: string | null;
    approval_token: string | null;
  }[];
  payments: {
    title: string;
    amount_cents: number;
    due_note: string | null;
    status: MilestoneStatus;
    requested_at: string | null;
    paid_at: string | null;
  }[];
  schedule: { title: string; starts_on: string; ends_on: string | null; trade: string | null; note: string | null }[];
  updates: { body: string; created_at: string }[];
}

export interface ScheduleItem {
  id: string;
  job_id: string;
  title: string;
  starts_on: string;
  ends_on: string | null;
  trade: string | null;
  note: string | null;
  visible_to_client: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  project: string | null;
  source: 'manual' | 'referral';
  referred_by_client_id: string | null;
  status: 'new' | 'contacted' | 'quoted' | 'closed';
  created_at: string;
}

export interface JobSite {
  job_id: string;
  parking: string | null;
  access: string | null;
  access_code: string | null;
  heads_up: string | null;
  washroom: string | null;
  water: string | null;
  power: string | null;
  notes: string | null;
  updated_at: string;
}

export interface JobSheet {
  id: string;
  job_id: string;
  token: string;
  trade_name: string;
  trade_phone: string | null;
  schedule_item_id: string | null;
  title: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface JobSheetView {
  id: string;
  sheet_id: string;
  kind: 'opened' | 'code';
  viewer_name: string | null;
  viewed_at: string;
}

/** JSON returned by get_job_sheet: what a trade sees. */
export interface PublicJobSheet {
  closed: boolean;
  business_name: string;
  contractor_name?: string;
  contractor_phone?: string;
  trade_name?: string;
  title?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  address?: string | null;
  job_title?: string;
  parking?: string | null;
  access?: string | null;
  has_code?: boolean;
  heads_up?: string | null;
  washroom?: string | null;
  water?: string | null;
  power?: string | null;
  notes?: string | null;
}

export interface Subcontractor {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  wsib_expires_on: string | null;
  insurance_expires_on: string | null;
  notes: string | null;
  created_at: string;
}
