export type ChangeStatus = 'draft' | 'sent' | 'approved' | 'declined' | 'void';
export type EventKind = 'note' | 'change_sent' | 'change_approved' | 'change_declined' | 'change_voided';

export interface Contractor {
  id: string;
  name: string;
  business_name: string;
  phone: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
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
  created_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  kind: EventKind;
  body: string;
  change_id: string | null;
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
}
