export const MALDIVES_OFFSET_MS = 5 * 60 * 60 * 1000;

export type ReportColumn<Row> = {
  header: string;
  value: (row: Row) => string | number | null;
};

export function splitList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 200);
}

/** Plain YYYY-MM-DD dates are whole days in Maldives time. */
export function parseDate(value?: string, endOfDay = false): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function displayDate(value: Date): string {
  const local = new Date(value.getTime() + MALDIVES_OFFSET_MS);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

export function startOfMaldivesMonth(): Date {
  const local = new Date(Date.now() + MALDIVES_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) -
      MALDIVES_OFFSET_MS,
  );
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function csvCell(value: string | number | null): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Leading =, +, - or @ would be evaluated as a formula by spreadsheet apps.
  const safe =
    /^[=+\-@\t\r]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<Row>(columns: ReportColumn<Row>[], rows: Row[]): string {
  const lines = [
    columns.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) =>
      columns.map((column) => csvCell(column.value(row))).join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** SpreadsheetML 2003: opens in Excel without a binary xlsx dependency. */
export function toExcel<Row>(
  sheetName: string,
  columns: ReportColumn<Row>[],
  rows: Row[],
): string {
  const cell = (value: string | number | null) =>
    typeof value === 'number'
      ? `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${escapeXml(value ?? '')}</Data></Cell>`;
  const header = columns.map((column) => cell(column.header)).join('');
  const body = rows
    .map(
      (row) =>
        `<Row>${columns.map((column) => cell(column.value(row))).join('')}</Row>`,
    )
    .join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(sheetName.slice(0, 31))}">
<Table>
<Row>${header}</Row>
${body}
</Table>
</Worksheet>
</Workbook>`;
}
