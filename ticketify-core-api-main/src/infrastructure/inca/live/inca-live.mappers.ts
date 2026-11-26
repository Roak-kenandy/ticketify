import {
  IncaBandwidthPoint,
  IncaClientRecord,
  IncaDetection,
  IncaDevice,
  IncaOpticalInfo,
  IncaOption,
  IncaPppoeCredentials,
  IncaStatusPoint,
  IncaSubscriber,
  IncaTodo,
  IncaTr069Fact,
  operatorNeedsPppoe,
} from '../inca.types';

/**
 * Pure translation between INCA's REST payloads and mPro's INCA port. Only the fields
 * listed here ever leave this module: INCA rows also carry other customers' names and
 * addresses, device admin passwords and OLT credentials, which are dropped on read.
 */

type Row = Record<string, unknown>;

/**
 * Active-device rows from GET /fttx/unregistered-active-devices and
 * /fttx/registered-active-devices (registered rows have no db* or equipment fields).
 */
export type IncaUnregisteredRow = Row & {
  serialNumber?: unknown;
  requestedOltId?: unknown;
  requestedOlt?: unknown;
  dbOltId?: unknown;
  dbOlt?: unknown;
  frameId?: unknown;
  slotId?: unknown;
  portId?: unknown;
  dbOpticalDeviceTypeId?: unknown;
  typeSpecificDataAggregated?: unknown;
  generalStatus?: unknown;
};

/** Rows from GET /views/fttx/optical-devices. */
export type IncaOpticalDeviceRow = Row & {
  id?: unknown;
  serialNumber?: unknown;
  oltId?: unknown;
  oltName?: unknown;
  opticalDeviceTypeId?: unknown;
  serviceAreaName?: unknown;
  oltGponPort?: unknown;
  portName?: unknown;
  assignedTerminalNodeId?: unknown;
  deletedAt?: unknown;
};

export type IncaDeviceTypeRow = Row & {
  id?: unknown;
  name?: unknown;
  ftth?: unknown;
  deletedAt?: unknown;
};

/** Serials are validated upstream; this is defence in depth for the filter we build. */
export const INCA_SERIAL_PATTERN = /^[A-Z0-9]{8,32}$/;
const ID_PATTERN = /^\d{1,10}$/;

export function isIncaId(value: string | null | undefined): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function id(value: unknown): string | null {
  const raw = text(value);
  return raw && ID_PATTERN.test(raw) ? raw : null;
}

function sameSerial(value: unknown, serial: string): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === serial;
}

function rows(payload: unknown): Row[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { resultList?: unknown })?.resultList)
      ? (payload as { resultList: unknown[] }).resultList
      : [];
  return list.filter(
    (item): item is Row => Boolean(item) && typeof item === 'object',
  );
}

export function parseLoginResponse(
  body: unknown,
  now: number,
): { token: string; userId: number; expiresAt: number } | null {
  const payload = body as { token?: unknown; user?: { id?: unknown } } | null;
  const tokenField = payload?.token;
  const token =
    typeof tokenField === 'string'
      ? tokenField
      : typeof (tokenField as { id?: unknown })?.id === 'string'
        ? (tokenField as { id: string }).id
        : null;
  const userId = Number(payload?.user?.id);
  if (!token || /\s/.test(token) || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }
  return { token, userId, expiresAt: jwtExpiry(token) ?? now + 60 * 60 * 1000 };
}

function jwtExpiry(token: string): number | null {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** INCA's `message` only, without control characters or anything token-shaped. */
export function safeIncaMessage(body: string): string {
  let message: unknown = null;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    message = parsed?.message ?? parsed?.error;
  } catch {
    return '';
  }
  if (typeof message !== 'string') return '';
  return message
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function activeDevicesFilter(serial: string) {
  return {
    skip: 0,
    limit: 10,
    order: 'serialNumber ASC',
    where: { and: [{ serialNumber: { ilike: serial } }] },
  };
}

export function opticalDeviceFilter(serial: string) {
  return { limit: 10, where: { serialNumber: { ilike: serial } } };
}

export function deviceTypesFilter() {
  return {
    order: 'name ASC',
    where: { or: [{ language: 'US' }, { language: null }] },
  };
}

export function mapDeviceTypes(payload: unknown): IncaOption[] {
  return rows(payload)
    .filter((row: IncaDeviceTypeRow) => !row.deletedAt && row.ftth !== false)
    .map((row: IncaDeviceTypeRow) => ({
      code: id(row.id),
      label: text(row.name),
    }))
    .filter((option): option is IncaOption =>
      Boolean(option.code && option.label),
    );
}

export function mapServiceAreas(payload: unknown): IncaOption[] {
  return rows(payload)
    .map((row) => ({
      code: id(row.serviceAreaId ?? row.id),
      label: text(row.serviceAreaName ?? row.name),
    }))
    .filter((option): option is IncaOption =>
      Boolean(option.code && option.label),
    );
}

/** ONT model as reported by the OLT, e.g. "EG8145V5". */
export function equipmentId(row: IncaUnregisteredRow): string | null {
  const aggregated = text(row.typeSpecificDataAggregated);
  const match = aggregated?.match(/ontEquipmentId:\s*([A-Za-z0-9._-]+)/);
  return match ? match[1] : null;
}

/** Firmware customisation, e.g. "MVOOREDOO"; only autofind rows report it. */
export function customizedInfo(row: IncaUnregisteredRow): string | null {
  const aggregated = text(row.typeSpecificDataAggregated);
  const match = aggregated?.match(/ontCustomizedInfo:\s*([A-Za-z0-9._-]+)/);
  return match ? match[1] : null;
}

/**
 * Picks the INCA device type for a reported model only when it is unambiguous: the numbered
 * standard type ("1_EG8145V5") wins, else an exact name match. VLAN/IPTV variants are
 * never guessed; the technician chooses those.
 */
export function matchDeviceType(
  model: string | null,
  types: IncaOption[],
): string | null {
  if (!model) return null;
  const wanted = model.toUpperCase();
  const standard = types.filter(
    (type) =>
      type.label.toUpperCase().replace(/^\d+_/, '') === wanted &&
      /^\d+_/.test(type.label),
  );
  if (standard.length === 1) return standard[0].code;
  const exact = types.filter((type) => type.label.toUpperCase() === wanted);
  return exact.length === 1 ? exact[0].code : null;
}

export function mapDetection(
  payload: unknown,
  serial: string,
  types: IncaOption[],
  state: 'UNREGISTERED' | 'REGISTERED' = 'UNREGISTERED',
): IncaDetection | null {
  const row = rows(payload).find((item: IncaUnregisteredRow) =>
    sameSerial(item.serialNumber, serial),
  ) as IncaUnregisteredRow | undefined;
  if (!row) return null;
  const oltId = id(row.requestedOltId) ?? id(row.dbOltId);
  if (!oltId) return null;
  const parts = [row.frameId, row.slotId, row.portId].map(text);
  const pon = parts.every((part) => part !== null && /^\d+$/.test(part))
    ? parts.join('/')
    : '';
  const status = text(row.generalStatus)?.toUpperCase();
  const operator = customizedInfo(row);
  return {
    olt_id: oltId,
    olt_name: text(row.requestedOlt) ?? text(row.dbOlt),
    pon,
    device_type:
      matchDeviceType(equipmentId(row), types) ?? id(row.dbOpticalDeviceTypeId),
    olt_state: state,
    online: status === 'ONLINE' ? true : status === 'OFFLINE' ? false : null,
    operator,
    pppoe_required: operatorNeedsPppoe(operator),
  };
}

export function mapOpticalDevice(
  payload: unknown,
  serial: string,
): IncaDevice | null {
  const row = rows(payload).find(
    (item: IncaOpticalDeviceRow) =>
      sameSerial(item.serialNumber, serial) && !item.deletedAt,
  ) as IncaOpticalDeviceRow | undefined;
  if (!row) return null;
  return {
    serial,
    registered: true,
    device_type: id(row.opticalDeviceTypeId),
    service_area: text(row.serviceAreaName),
    olt_id: id(row.oltId),
    olt_name: text(row.oltName),
    pon: text(row.oltGponPort) ?? text(row.portName),
    terminal_node_id: id(row.assignedTerminalNodeId),
    device_id: id(row.id),
  };
}

/** Exactly what INCA's own UI posts when registering an ONT; INCA locates the port itself. */
export function registerOntBody(input: {
  serial: string;
  device_type: string;
  olt_id: string;
}) {
  return {
    serialNumber: input.serial,
    opticalDeviceTypeId: input.device_type,
    oltId: input.olt_id,
    macAddress: null,
    guarantee: null,
    adminPassword: null,
    comment: null,
    description: null,
    fixIp: null,
    outerIdentity: null,
    profiles: null,
  };
}

/** Maldives local time; every real INCA city uses it. */
export const MALDIVES_OFFSET_SECONDS = 18000;
export const INCA_IDENTITY_PATTERN = /^[A-Z0-9-]{3,30}$/;

/** Case- and spacing-insensitive name comparison for cities and streets. */
export function sameName(a: string, b: string): boolean {
  const norm = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

export function mapNamedOptions(payload: unknown): IncaOption[] {
  return rows(payload)
    .filter((row) => !row.deletedAt)
    .map((row) => ({ code: id(row.id), label: text(row.name) }))
    .filter((option): option is IncaOption =>
      Boolean(option.code && option.label),
    );
}

export function streetsFilter(cityId: string) {
  return { order: 'name ASC', where: { and: [{ cityId }] } };
}

/** Identity is validated to [A-Z0-9-], so it carries no LIKE wildcards. */
export function clientFilter(identity: string) {
  return { limit: 5, where: { and: [{ identity: { ilike: identity } }] } };
}

export function mapClient(
  payload: unknown,
  identity: string,
): IncaClientRecord | null {
  const row = rows(payload).find(
    (item) => !item.deletedAt && sameSerial(item.identity, identity),
  );
  const clientId = row ? id(row.id) : null;
  if (!row || !clientId) return null;
  return { id: clientId, identity, name: text(row.name) ?? '' };
}

export function createdId(payload: unknown): string | null {
  return id((payload as Row | null)?.id);
}

export function cityBody(input: {
  name: string;
  area_code: string;
  service_area_id: string | null;
}) {
  return {
    serviceAreaId: input.service_area_id,
    name: input.name,
    areaCode: input.area_code,
    timeOffset: MALDIVES_OFFSET_SECONDS,
    timeOffsetSummer: MALDIVES_OFFSET_SECONDS,
    outerIdentity: null,
  };
}

export function streetBody(input: {
  name: string;
  city_id: string;
  service_area_id: string | null;
}) {
  return {
    serviceAreaId: input.service_area_id,
    name: input.name,
    cityId: input.city_id,
    outerIdentity: null,
  };
}

export function clientBody(input: {
  identity: string;
  name: string;
  city_id: string;
  street: string;
  phone: string | null;
  email: string | null;
  service_area_id: string | null;
}) {
  return {
    serviceAreaId: input.service_area_id,
    name: input.name,
    identity: input.identity,
    password: null,
    cityId: input.city_id,
    street: input.street,
    contact: null,
    email: input.email,
    note: null,
    outerIdentity: null,
    phone: input.phone,
  };
}

export function terminalNodeFilter(clientId: string, number: string) {
  return {
    limit: 5,
    where: {
      and: [{ clientId: Number(clientId) }, { number: Number(number) }],
    },
  };
}

/** Same fields INCA's Terminal Node form posts; PPPoE / Radius is applied in a later step. */
export function terminalNodeBody(input: {
  name: string;
  number: string;
  client_id: string;
  city_id: string;
  street_id: string;
  phone: string | null;
  email: string | null;
  service_area_id: string | null;
}) {
  return {
    serviceAreaId: input.service_area_id,
    name: input.name,
    password: null,
    clientId: input.client_id,
    cityId: input.city_id,
    streetId: input.street_id,
    number: input.number,
    numberExt: null,
    contact: null,
    phone: input.phone,
    email: input.email,
    hookedById: null,
    hookedAt: null,
    contract: null,
    isFtth: true,
    customVlanTaggingNetId: null,
    customVlanTaggingIptvId: null,
    mapDataId: null,
    outerIdentity: null,
    comment: null,
    radiusUsername: null,
    radiusPassword: null,
  };
}

/** What INCA's UI patches onto the Terminal Node when PPPoE is switched on. */
export function pppoeBody(credentials: IncaPppoeCredentials) {
  return {
    isPppoe: true,
    radiusUsername: credentials.username,
    radiusPassword: credentials.password,
  };
}

/**
 * Address part of INCA's Terminal Node edit. INCA's PATCH merges, so only these fields are
 * sent: the Radius password and everything else on the node stay as they are.
 */
export function locationBody(input: {
  city_id: string;
  street_id: string;
  number: string;
}) {
  return {
    cityId: input.city_id,
    streetId: input.street_id,
    number: Number(input.number),
  };
}

/** OLT part of INCA's optical device edit; the device admin password is never sent. */
export function deviceOltBody(oltId: string) {
  return { oltId };
}

export function existingTerminalNodeId(payload: unknown): string | null {
  const row = rows(payload).find((item) => !item.deletedAt);
  return row ? id(row.id) : null;
}

/** INCA views repeat each row once per UI language; keep the English one. */
export const US_LANGUAGE = { or: [{ language: 'US' }, { language: null }] };

/** INCA's Terminal Node name search. The name is matched, never a password field. */
export function terminalNodeNameFilter(query: string) {
  return {
    skip: 0,
    limit: 100,
    order: 'name DESC',
    where: {
      and: [{ name: { ilike: `%${query}%` } }, US_LANGUAGE],
    },
  };
}

export function mapTerminalNodeMatches(payload: unknown): {
  terminal_node_id: string;
  name: string;
  client_name: string;
  client_identifier: string;
  address: string | null;
  serial: string | null;
  package: string;
  status: string | null;
  olt_name: string | null;
}[] {
  const seen = new Set<string>();
  const matches = [];
  for (const row of rows(payload)) {
    if (row.deletedAt) continue;
    const nodeId = id(row.id);
    if (!nodeId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    matches.push({
      terminal_node_id: nodeId,
      name: text(row.name) ?? '',
      client_name: text(row.clientName) ?? '',
      client_identifier: text(row.clientIdentifier) ?? '',
      address:
        [text(row.streetName), text(row.number), text(row.cityName)]
          .filter(Boolean)
          .join(', ') || null,
      serial: text(row.serialNumber)?.toUpperCase() ?? null,
      package: text(row.packageName) ?? '',
      status: text(row.status),
      olt_name: text(row.oltName),
    });
  }
  return matches;
}

export function terminalNodeViewFilter(terminalNodeId: string) {
  return {
    limit: 50,
    where: { and: [{ id: Number(terminalNodeId) }, US_LANGUAGE] },
  };
}

/** INCA's Terminal node search by ONU serial (exact, case-insensitive). */
export function terminalNodeBySerialFilter(serial: string) {
  return {
    limit: 20,
    where: { and: [{ serialNumber: { ilike: serial } }, US_LANGUAGE] },
  };
}

/** Distinct Terminal Nodes holding exactly this ONU serial. */
export function terminalNodeIdsBySerial(
  payload: unknown,
  serial: string,
): string[] {
  return [
    ...new Set(
      rows(payload)
        .filter((row) => !row.deletedAt && sameSerial(row.serialNumber, serial))
        .map((row) => id(row.id))
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    ),
  ];
}

/**
 * Row id of the active ONU binding (GET /views/fttx/terminal-nodes/{id}/optical-devices);
 * INCA's "Revoke" deletes /fttx/terminal-nodes-optical-device/{this id}.
 */
export function onuLinkId(payload: unknown, serial: string): string | null {
  const row = rows(payload).find(
    (item) =>
      !item.deletedAt && !item.endDate && sameSerial(item.serialNumber, serial),
  );
  return row ? id(row.id) : null;
}

export function packagesFilter() {
  return { order: 'name ASC', limit: 500 };
}

/** Packages a technician can assign. Anything else INCA offers stays out of the dropdown. */
const OFFERED_PACKAGES = [
  'NET_IPTV_ONLY',
  'NET_IPTV_PUB_WIFI',
  'NET ONLY',
  'HM_PHS2_CPE',
];

export function mapPackages(payload: unknown): IncaOption[] {
  const offered = new Map(
    OFFERED_PACKAGES.map((name, index) => [name.toLowerCase(), index]),
  );
  return mapNamedOptions(payload)
    .filter((option) => offered.has(option.label.trim().toLowerCase()))
    .sort(
      (a, b) =>
        (offered.get(a.label.trim().toLowerCase()) ?? 0) -
        (offered.get(b.label.trim().toLowerCase()) ?? 0),
    );
}

/** INCA's own Todo tab query: tasks whose params name this Terminal Node. */
export function todosFilter(terminalNodeId: string) {
  return {
    order: 'taskDate ASC',
    where: {
      and: [{ params: { ilike: `%terminal_node_id=${terminalNodeId},%` } }],
    },
  };
}

/** A task INCA keeps retrying with an error is treated as failed after this many tries. */
export const TODO_FAILED_TRIES = 5;

/** Rows exist only while the task is still open; INCA removes them once done. */
export function mapTodos(payload: unknown): IncaTodo[] {
  return rows(payload)
    .map((row) => {
      const todoId = id(row.id);
      if (!todoId) return null;
      const info = text(row.additionalInfo);
      const params = text(row.params);
      const action = params?.split(',')[0]?.trim() ?? '';
      const entity = text(row.entityOperation);
      const tries = typeof row.todoTries === 'number' ? row.todoTries : 0;
      const skipping = /cache is outdated/i.test(info ?? '');
      const todo: IncaTodo = {
        id: todoId,
        type: text(row.task) ?? entity ?? 'TASK',
        // A status change carries delete_onu or create_onu in params. The delete is what
        // Terminated asks the OLT to do; the entity name alone hides that.
        operation:
          entity && /revoke|delete_onu/i.test(entity)
            ? entity
            : /^(delete_onu|create_onu)$/i.test(action)
              ? action
              : entity ?? (action || null),
        status:
          info && tries >= TODO_FAILED_TRIES && !skipping
            ? 'FAILED'
            : 'PENDING',
        message: info ? info.slice(0, 200) : undefined,
      };
      return todo;
    })
    .filter((todo): todo is IncaTodo => todo !== null);
}

/**
 * A revoke Todo that cannot see the ONT on the OLT it was told to delete from.
 * The binding is already gone; INCA keeps retrying a delete that has nothing to
 * remove. Relocation moves the record to the OLT that does see the ONT.
 */
export function revokeAlreadyGone(todo: IncaTodo): boolean {
  const operation = todo.operation ?? '';
  return (
    /revoke|delete_onu/i.test(operation) &&
    /not found on the (normal or )?autofind list/i.test(todo.message ?? '')
  );
}

export function nodeHistoryFilter(language = false) {
  return {
    skip: 0,
    limit: 100,
    order: 'startDate DESC',
    ...(language ? { where: US_LANGUAGE } : {}),
  };
}

/** The node's current package: newest, not ended or deleted. */
export function currentPackageId(payload: unknown): string | null {
  const row = rows(payload).find((item) => !item.deletedAt && !item.endDate);
  return row ? id(row.packageId) : null;
}

/** The node's current status row; INCA changes status by PATCHing this row. */
export function currentStatus(
  payload: unknown,
): { rowId: string; statusId: string | null } | null {
  const row = rows(payload).find((item) => !item.deletedAt && !item.endDate);
  const rowId = row ? id(row.id) : null;
  return row && rowId ? { rowId, statusId: id(row.statusId) } : null;
}

/** INCA's fixed list value for "Connected"; ids can differ between installations. */
export const CONNECTED_STATUS = 'DD_STATUS_BEKOTVE';
/** INCA's fixed list value for "Terminated". */
export const TERMINATED_STATUS = 'DD_STATUS_MEGSZUNT';

export function statusIdByListValue(
  payload: unknown,
  listValue: string,
): string | null {
  const row = rows(payload).find(
    (item) => item.listValue === listValue && !item.deletedAt,
  );
  return row ? id(row.id) : null;
}

export function connectedStatusId(payload: unknown): string | null {
  return statusIdByListValue(payload, CONNECTED_STATUS);
}

const OPTICAL_FIELDS: [
  prefix: string,
  key: 'tx_dbm' | 'rx_dbm' | 'olt_rx_dbm',
][] = [
  ['ont tx optical power', 'tx_dbm'],
  ['ont rx optical power', 'rx_dbm'],
  ['olt rx ont optical power', 'olt_rx_dbm'],
];

/**
 * GET /fttx/olts/{olt}/optical-info/serial-numbers/{serial} answers with the OLT's text
 * output ("ONT Rx optical power (dBm): -20.45" per line) and a reason when it has none.
 */
export function parseOpticalInfo(
  payload: unknown,
  readAt: string,
): IncaOpticalInfo {
  const body = (payload ?? {}) as { response?: unknown; reason?: unknown };
  const reason = text(body.reason);
  const details = (typeof body.response === 'string' ? body.response : '')
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf(':');
      return at > 0
        ? { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }
        : null;
    })
    .filter((item): item is { label: string; value: string } =>
      Boolean(item?.label && item.value),
    )
    .slice(0, 30);
  const info: IncaOpticalInfo = {
    online: false,
    rx_dbm: null,
    tx_dbm: null,
    olt_rx_dbm: null,
    alarms: reason ? [reason.slice(0, 200)] : [],
    read_at: readAt,
    details,
  };
  for (const { label, value } of details) {
    const field = OPTICAL_FIELDS.find(([prefix]) =>
      label.toLowerCase().startsWith(prefix),
    );
    const number = Number(value);
    if (field && value && Number.isFinite(number)) info[field[1]] = number;
  }
  info.online = info.rx_dbm !== null;
  return info;
}

/** Rows from GET /views/fttx/terminal-nodes; one row per attached ONU / task. */
export function mapTerminalNode(payload: unknown): IncaSubscriber | null {
  const list = rows(payload).filter((row) => !row.deletedAt);
  const row = list[0];
  const nodeId = row ? id(row.id) : null;
  if (!row || !nodeId) return null;
  const serials = [
    ...new Set(
      list
        .map((item) => text(item.serialNumber)?.toUpperCase())
        .filter((serial): serial is string => Boolean(serial)),
    ),
  ];
  return {
    terminal_node_id: nodeId,
    client_identifier: text(row.clientIdentifier) ?? '',
    name: text(row.name) ?? '',
    address:
      [text(row.streetName), text(row.number), text(row.cityName)]
        .filter(Boolean)
        .join(', ') || null,
    service_area: text(row.serviceAreaName) ?? '',
    package: text(row.packageName) ?? '',
    pppoe_username: text(row.radiusUsername) ?? '',
    pppoe_enabled: row.isPppoeActive === true,
    pppoe_configured: row.isPppoe === true,
    connected: row.statusOperational === true,
    onu_serials: serials,
    olt_id: id(row.onuOltId),
    pon: null,
    location: {
      city_id: id(row.cityId),
      street_id: id(row.streetId),
      number: text(row.number),
    },
  };
}

export function mapRegisteredOnt(
  payload: unknown,
  input: {
    serial: string;
    olt_id: string;
    olt_name?: string | null;
    pon: string;
  },
): IncaDevice {
  const row = (payload ?? {}) as IncaOpticalDeviceRow;
  return {
    serial: input.serial,
    registered: true,
    device_type: id(row.opticalDeviceTypeId),
    service_area: null,
    olt_id: id(row.oltId) ?? input.olt_id,
    olt_name: input.olt_name ?? null,
    pon: input.pon || null,
    terminal_node_id: null,
  };
}

const HOUR_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** The window INCA's bandwidth and status views filter on. */
export function hourWindowFilter(from: string, to: string) {
  return {
    order: 'subjectHour ASC',
    where: {
      and: [{ subjectHour: { gt: from } }, { subjectHour: { lte: to } }],
    },
    include: {},
  };
}

export function mapBandwidth(payload: unknown): IncaBandwidthPoint[] {
  return rows(payload)
    .map((row) => {
      const at = text(row.subjectHour);
      if (!at) return null;
      const services = Object.entries(asRecord(row.jsonData))
        .map(([id, raw]) => {
          const item = asRecord(raw);
          const up = numberValue(item.up);
          const down = numberValue(item.down);
          if (up === null && down === null) return null;
          return { id, up: up ?? 0, down: down ?? 0 };
        })
        .filter((item): item is IncaBandwidthPoint['services'][number] =>
          Boolean(item),
        );
      return services.length ? { at, services } : null;
    })
    .filter((point): point is IncaBandwidthPoint => Boolean(point))
    .slice(0, 400);
}

export function mapStatusPoints(payload: unknown): IncaStatusPoint[] {
  return rows(payload)
    .map((row) => {
      const at = text(row.subjectHour);
      if (!at) return null;
      const services = Object.entries(asRecord(row.jsonData))
        .map(([id, raw]) => {
          const status = numberValue(asRecord(raw).status);
          return status === null ? null : { id, status };
        })
        .filter((item): item is IncaStatusPoint['services'][number] =>
          Boolean(item),
        );
      return services.length ? { at, services } : null;
    })
    .filter((point): point is IncaStatusPoint => Boolean(point))
    .slice(0, 400);
}

/**
 * The signal screen shows the ONU, PPPoE and later WAN addresses. The rest of the
 * TR-069 tree (voice, hosts, management URLs) stays out.
 */
export function mapTr069(payload: unknown): IncaTr069Fact[] {
  const device = rows(payload)[0]?.InternetGatewayDevice as
    | Record<string, unknown>
    | undefined;
  if (!device) return [];
  const facts: IncaTr069Fact[] = [];
  const uptime = trValue(
    (device.DeviceInfo as Record<string, unknown> | undefined)?.UpTime,
  );
  if (uptime) facts.push({ label: 'Uptime', value: `${uptime} seconds` });
  const connections = (
    (device.WANDevice as Record<string, unknown> | undefined)?.['1'] as
      | Record<string, unknown>
      | undefined
  )?.WANConnectionDevice as Record<string, unknown> | undefined;
  if (!connections) return facts;
  let pppoe = 0;
  for (const [index, raw] of Object.entries(connections)) {
    if (index.startsWith('_') || !raw || typeof raw !== 'object') continue;
    const node = raw as Record<string, unknown>;
    const ppp = firstChild(node.WANPPPConnection);
    if (ppp) {
      pppoe += 1;
      const name = pppoe === 1 ? 'PPPoE' : `PPPoE ${pppoe}`;
      pushFact(facts, `${name} IP`, trValue(ppp.ExternalIPAddress));
      pushFact(facts, `${name} MAC`, trValue(ppp.MACAddress));
      const session = trValue(ppp.Uptime);
      if (session) facts.push({ label: `${name} uptime`, value: `${session} seconds` });
    }
    const ip = firstChild(node.WANIPConnection);
    if (ip) {
      const name = index === '1' ? 'ONU' : `WAN${index}`;
      pushFact(facts, `${name} IP`, trValue(ip.ExternalIPAddress));
      pushFact(facts, `${name} MAC`, trValue(ip.MACAddress));
    }
  }
  return facts;
}

export function isHourStamp(value: string): boolean {
  return HOUR_STAMP.test(value);
}

function pushFact(facts: IncaTr069Fact[], label: string, value: string | null) {
  if (value) facts.push({ label, value });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trValue(node: unknown): string | null {
  const value = asRecord(node)._value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const textValue = typeof value === 'string' ? value.trim() : '';
  return textValue || null;
}

function firstChild(group: unknown): Record<string, unknown> | null {
  const entry = Object.entries(asRecord(group)).find(
    ([key]) => !key.startsWith('_'),
  );
  const child = entry?.[1];
  return child && typeof child === 'object'
    ? (child as Record<string, unknown>)
    : null;
}
