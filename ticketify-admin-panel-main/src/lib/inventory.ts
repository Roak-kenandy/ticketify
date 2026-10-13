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
};

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
