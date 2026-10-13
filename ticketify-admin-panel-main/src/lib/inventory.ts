export type InventoryRowStatus = "Posted" | "Adjusted" | "Reversed";

export type InventoryReportRow = {
  id: string;
  posted_at: string;
  crm_ticket_id: string;
  sr_number: string | null;
  technician_user_id: string;
  technician_name: string;
  department: string | null;
  item_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  original_quantity: number;
  uom: string;
  serial_number: string | null;
  service_type: string | null;
  inca_actions: string | null;
  area: string | null;
  customer_name: string | null;
  remarks: string | null;
  status: InventoryRowStatus;
  adjustment_note: string | null;
};

export type InventorySummary = {
  totals: {
    lines: number;
    tickets: number;
    technicians: number;
    reversed: number;
  };
  by_technician: {
    technician_user_id: string;
    technician_name: string;
    tickets: number;
    lines: number;
    items: { item_name: string; uom: string; quantity: number }[];
  }[];
  by_item: {
    item_id: string;
    item_code: string;
    item_name: string;
    uom: string;
    quantity: number;
    lines: number;
    serials: number;
  }[];
  by_business_line: {
    department: string;
    service_type: string;
    tickets: number;
    lines: number;
    items: { item_name: string; uom: string; quantity: number }[];
  }[];
};

export type StockTechnician = { id: string; name: string; email: string; role: string | null };

export type StockSummaryRow = {
  technician_user_id: string;
  technician_name: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  serialized: boolean;
  issued: number;
  consumed: number;
  returned_good: number;
  returned_faulty: number;
  in_hand: number;
};

export type StockSummary = {
  period: { from: string | null; to: string | null };
  rows: StockSummaryRow[];
  by_item: (Omit<StockSummaryRow, "technician_user_id" | "technician_name"> & { technicians: number })[];
  totals: { technicians: number; technicians_holding: number; items: number; overdrawn: number };
};

export type StockMovementRow = {
  id: string;
  created_at: string;
  batch_id: string;
  type: "Issue" | "Return";
  technician_user_id: string;
  technician_name: string;
  item_code: string;
  item_name: string;
  quantity: number;
  uom: string;
  serial_number: string | null;
  condition: "Good" | "Faulty" | null;
  reference: string | null;
  notes: string | null;
  performed_by_name: string;
};

export type SerialUnitStatus = "WITH_TECHNICIAN" | "CONSUMED" | "RETURNED" | "FAULTY";

export type SerialUnitRow = {
  serial_number: string;
  item_code: string;
  item_name: string;
  status: SerialUnitStatus;
  technician_name: string | null;
  last_issued_to: string | null;
  crm_ticket_id: string | null;
  sr_number: string | null;
  installed_at: string | null;
  issued_at: string;
  updated_at: string;
};

export const SERIAL_STATUS_LABEL: Record<SerialUnitStatus, string> = {
  WITH_TECHNICIAN: "With technician",
  CONSUMED: "Installed",
  RETURNED: "In store",
  FAULTY: "Faulty",
};

/** Same rule the API applies to ONT and other device serials. */
export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

/** Splits pasted / scanned text into normalized serials (one per line, comma or space). */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

export function newSlipKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type InventoryFilterOptions = {
  departments: string[];
  service_types: string[];
  inca_actions: { value: string; label: string }[];
  areas: string[];
  technicians: { id: string; name: string }[];
  items: { id: string; code: string; name: string; active: boolean }[];
  default_from: string;
};

export type InventoryItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  stock_uom: string;
  consumption_uom: string;
  conversion_factor: number;
  serialized: boolean;
  allow_decimal: boolean;
  remarks_required: boolean;
  active: boolean;
  notes: string | null;
  sort_order: number;
};

/** "12.5 Meters", "1 Unit" — at most 2 decimals, unit pluralised. */
export function formatQuantity(quantity: number, uom: string): string {
  const amount = quantity.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const unit = quantity === 1 || uom.endsWith("s") ? uom : `${uom}s`;
  return `${amount} ${unit}`;
}

/** Local YYYY-MM-DD for the first day of this month. */
export function startOfMonthInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
