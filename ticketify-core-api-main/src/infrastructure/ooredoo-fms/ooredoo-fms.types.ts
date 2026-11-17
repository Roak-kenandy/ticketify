/** Known FMS TT status ids captured from the portal (options are context-dependent). */
export const FMS_TICKET_STATUS = {
  FAULT_RESOLVED: 5,
  OPEN_IN_PROGRESS: 11,
  OPEN_UNREACHABLE: 12,
  OPEN_INFORMED: 13,
  FAULT_REQUEST_CANCELLED: 32,
} as const;

/**
 * Medianet partner queues we pull into mPro.
 * MediaNet Male' is matched by name until its numeric id is confirmed.
 */
export const FMS_MEDIANET_QUEUES = [
  { id: null as number | null, name: "MediaNet Male'" },
  { id: 86, name: 'Hulhumale Phase 1' },
  { id: 186, name: 'S_Feydhoo_MN' },
] as const;

export type FmsTicketSummary = {
  id: string;
  queue: string | null;
  status: string | null;
  assignee_email: string | null;
  account_number: string | null;
  serial_number: string | null;
  customer_name: string | null;
  description: string | null;
  created_at: string | null;
  priority?: string | null;
  category?: string | null;
  sub_category?: string | null;
};

export function isFmsTicketId(id: string): boolean {
  return /^[0-9]{3,12}$/.test(String(id ?? '').trim());
}

export type FmsTicketAttachment = {
  id: string;
  user: string | null;
  comment: string | null;
  file_name: string | null;
  /** Absolute or site-relative FMS URL when present. */
  file_url: string | null;
  at: string | null;
};

export type FmsTicketDetail = FmsTicketSummary & {
  type: string | null;
  category: string | null;
  sub_category: string | null;
  priority: string | null;
  region: string | null;
  partner: string | null;
  description: string | null;
  customer_contact: string | null;
  salesforce_id: string | null;
  /** From FMS "Customer Installation Address". */
  address_line_1: string | null;
  address_line_2: string | null;
  street: string | null;
  atoll: string | null;
  comments: { user: string; comment: string; at: string }[];
  attachments: FmsTicketAttachment[];
};

/** Locked identity + editable address fields for relocation updates. */
export type FmsAddressForm = {
  ticket_id: string;
  can_edit: boolean;
  account_id: string | null;
  contract_type: string;
  firstname: string;
  lastname: string;
  middlename: string;
  mobile: string;
  email: string;
  phone_home: string;
  phone_work: string;
  address1: string;
  address2: string;
  street: string;
  company: string;
  zip: string;
  country_id: string;
  atoll_id: string;
  island_id: string;
  atolls: FmsSelectOption[];
  countries: FmsSelectOption[];
};

export type FmsAssignUserOption = { id: string; email: string };

export type FmsSelectOption = { id: string; label: string };

/** Dropdowns from the FMS ticket_info Change modals (context-dependent). */
export type FmsTicketEditOptions = {
  ticket_id: string;
  priorities: FmsSelectOption[];
  statuses: FmsSelectOption[];
  status_sub_comments: FmsSelectOption[];
  queues: FmsSelectOption[];
  queue_subcats: FmsSelectOption[];
  categories: FmsSelectOption[];
  assignees: FmsAssignUserOption[];
};
