/** Phase 2 API shapes: inventory declaration, INCA provisioning and closure checks. */

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
};

export type MyStockItem = {
  item: Pick<
    InventoryItem,
    "id" | "code" | "name" | "category" | "consumption_uom" | "serialized" | "allow_decimal" | "remarks_required" | "active"
  >;
  issued: number;
  consumed: number;
  returned: number;
  /** Supervisors: handed to technicians, and taken back from them. */
  handed_out: number;
  taken_back: number;
  in_hand: number;
  serials: { serial_number: string; issued_at: string }[];
};

/**
 * What the signed-in user holds; restricted = may only record these.
 * holder SUPERVISOR = receives from the store and hands out to technicians.
 */
export type MyStock = { holder: "SUPERVISOR" | "TECHNICIAN" | null; restricted: boolean; items: MyStockItem[] };

export type InventoryLine = {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  serialized: boolean;
  allow_decimal: boolean;
  quantity: number;
  effective_quantity: number;
  uom: string;
  serial_number: string | null;
  remarks: string | null;
  status: 'POSTED' | 'REVERSED';
  adjusted: boolean;
  provisioning_transaction_id: string | null;
  posted_at: string;
};

export type ProposedInventoryLine = {
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  quantity: number;
  serial_number: string;
  provisioning_transaction_id: string;
  reason: string;
};

export type TicketInventory = {
  crm_ticket_id: string;
  header: {
    sr_number: string | null;
    customer_name: string | null;
    terminal_node_id: string | null;
    department: string | null;
    service_type: string | null;
    area: string | null;
  } | null;
  declaration: {
    type: 'USED' | 'NONE_USED';
    declared_at: string;
  } | null;
  lines: InventoryLine[];
  proposed_lines: ProposedInventoryLine[];
  locked: boolean;
};

export type ProvisioningAction =
  | 'NEW_CONNECTION'
  | 'ONT_REPLACEMENT'
  | 'RELOCATION'
  | 'SIGNAL_CHECK';

export type ProvisioningStatus =
  | 'VALIDATING'
  | 'REGISTERING_ONT'
  | 'APPLYING_CONFIG'
  | 'WAITING_TODO'
  | 'VERIFYING'
  | 'SUCCEEDED'
  | 'FAILED';

export type SignalResult = 'WITHIN_RANGE' | 'OUTSIDE_RANGE' | 'NO_READING';

export type OpticalReading = {
  online: boolean;
  rx_dbm: number | null;
  tx_dbm: number | null;
  olt_rx_dbm: number | null;
  alarms: string[];
  read_at: string;
  result: SignalResult;
  /** Every line INCA reports (voltage, bias current, temperature, CATV …). */
  details?: Array<{label: string; value: string}>;
};

export type ProvisioningResult = {
  terminal_node_id?: string;
  ont_serial?: string;
  olt_id?: string;
  pon?: string;
  service_area?: string;
  package?: string;
  pppoe_username?: string;
  connected?: boolean;
  optical?: OpticalReading | null;
  range?: {min_dbm: number; max_dbm: number};
  before?: OpticalReading | null;
  after?: OpticalReading | null;
  action_taken?: string | null;
  service_confirmed?: boolean;
  signal_result?: SignalResult;
  recovered_ont_serial?: string | null;
};

export type ProvisioningStep = {
  id: string;
  attempt: number;
  stage: ProvisioningStatus;
  stage_label: string;
  ok: boolean;
  message: string;
  created_at: string;
};

export type ProvisioningTransaction = {
  id: string;
  crm_ticket_id: string;
  action: ProvisioningAction;
  action_label: string;
  status: ProvisioningStatus;
  status_label: string;
  in_progress: boolean;
  attempts: number;
  failed_stage: ProvisioningStatus | null;
  failed_stage_label: string | null;
  error_message: string | null;
  can_retry: boolean;
  submitted: {
    pppoe_password_provided?: boolean;
    service_area?: string | null;
    device_type?: string | null;
  } | null;
  result: ProvisioningResult | null;
  ont_serial: string | null;
  old_ont_serial: string | null;
  installs_ont: boolean;
  technician: {id: string; name: string};
  started_at: string;
  finished_at: string | null;
  steps: ProvisioningStep[];
};

export type IncaOption = {code: string; label: string; item_code?: string};

export type IncaSubscriberView = {
  terminal_node_id: string;
  client_identifier?: string | null;
  service_area: string | null;
  address: string | null;
  package: string | null;
  pppoe_username: string | null;
  pppoe_password_masked: string;
  /** PPPoE credentials are set on the Terminal Node (independent of a live session). */
  pppoe_configured?: boolean;
  connected: boolean;
  onu_serials: string[];
  olt_id: string | null;
  pon: string | null;
  /** The node's address as INCA ids; prefills the relocation destination. */
  location?: { city_id: string | null; street_id: string | null; number: string | null } | null;
};

/** GET /provisioning/tickets/:id/inca/subscriber?serial= */
export type IncaSubscriberLookup = {
  serial: string;
  found: boolean;
  subscriber: IncaSubscriberView | null;
};

export type ProvisioningContext = {
  crm_ticket_id: string;
  sr_number: string | null;
  customer_name: string | null;
  client_identifier: string;
  service_type: string | null;
  category: string | null;
  area: string | null;
  address: string | null;
  inca: {
    mode: string;
    available: boolean;
    error: string | null;
    pppoe_required?: boolean;
    /** Replacement locates the customer's Terminal Node by the current ONT serial. */
    current_ont_required?: boolean;
  };
  policy: {
    actions: Array<{action: ProvisioningAction; label: string}>;
    recommended: ProvisioningAction[];
    required_action: ProvisioningAction | null;
    signal_required: boolean;
  };
  subscriber: IncaSubscriberView | null;
  options: {
    service_areas: IncaOption[];
    device_types: IncaOption[];
    packages: IncaOption[];
    cities: IncaOption[];
  };
  suggested: {
    pppoe_username: string | null;
    service_area: string | null;
    terminal_node: {
      name: string;
      number: string;
      phone: string | null;
      city_id: string | null;
    };
  };
  range: {min_dbm: number; max_dbm: number};
  status: {code: string; label: string};
  transactions: ProvisioningTransaction[];
};

export type OntDetection = {
  serial: string;
  /**
   * REGISTERED: has an INCA record. OLT_REGISTERED: still configured on the OLT without an
   * INCA record; INCA cannot add it until it is removed from the OLT.
   */
  status: 'UNREGISTERED' | 'OLT_REGISTERED' | 'REGISTERED' | 'NOT_DETECTED';
  olt_id: string | null;
  olt_name?: string | null;
  pon: string | null;
  device_type: string | null;
  terminal_node_id: string | null;
  /** Active Device list the ONT was found on. */
  olt_state?: 'UNREGISTERED' | 'REGISTERED' | null;
  online?: boolean | null;
  /** Firmware customisation the OLT reports, e.g. MVOOREDOO. */
  operator?: string | null;
  /** Operator-firmware ONT: registration needs the customer's PPPoE username and password. */
  pppoe_required?: boolean;
  message: string;
};

export type ClosureCheck = {
  key: string;
  label: string;
  ok: boolean;
  severity: 'block' | 'warn';
  message: string;
  action: 'inventory' | 'provisioning' | null;
};

export type ClosureEvaluation = {
  crm_ticket_id: string;
  enforced: boolean;
  ready: boolean;
  checks: ClosureCheck[];
};
