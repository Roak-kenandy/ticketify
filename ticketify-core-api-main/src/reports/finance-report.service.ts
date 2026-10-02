import { Injectable } from '@nestjs/common';
import { Prisma, TicketPaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';

export type FinancePaymentRow = {
  invoice_no: string;
  receipt_no: string;
  bml_reference_id: string;
  ticket_no: string;
  service_request_id: string;
  ticket_category: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  quantity: number;
  /** Line amount before GST. */
  product_amount: string;
  /** This line's share of the GST collected. */
  gst_amount: string;
  /** product_amount + gst_amount; sums to the money received. */
  total_amount: string;
  paid_date: string;
  issued_by: string;
};

type ChargeLine = {
  code?: string;
  label?: string;
  amount_mvr?: string | number;
  unit_amount_mvr?: string | number;
  line_total_mvr?: string | number;
  quantity?: number;
};

export type FinanceReportQuery = {
  serviceRequestId?: string;
  from?: string;
  to?: string;
};

/** Finance reports only ever cover money actually received. */
const PAID: Prisma.TicketPaymentWhereInput = {
  status: TicketPaymentStatus.CONFIRMED,
  confirmed_at: { not: null },
};

const MALDIVES_OFFSET_MS = 5 * 60 * 60 * 1000;

const paymentInclude = {
  invoice: true,
  receipt: true,
} satisfies Prisma.TicketPaymentInclude;

type PaidPayment = Prisma.TicketPaymentGetPayload<{
  include: typeof paymentInclude;
}>;

@Injectable()
export class FinanceReportService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmApiClient,
  ) {}

  async summary() {
    const [all, month, recent] = await Promise.all([
      this.prisma.ticketPayment.aggregate({
        where: PAID,
        _count: { _all: true },
        _sum: { amount_mvr: true, tax_mvr: true },
      }),
      this.prisma.ticketPayment.aggregate({
        where: { ...PAID, confirmed_at: { gte: this.startOfMaldivesMonth() } },
        _count: { _all: true },
        _sum: { amount_mvr: true },
      }),
      this.prisma.ticketPayment.findMany({
        where: PAID,
        include: paymentInclude,
        orderBy: { confirmed_at: 'desc' },
        take: 6,
      }),
    ]);

    const usersById = await this.usersById(recent);
    const totalCents = this.cents(all._sum.amount_mvr);
    const gstCents = this.cents(all._sum.tax_mvr);

    return {
      paid_count: all._count._all,
      total_collected: this.money(totalCents),
      gst_collected: this.money(gstCents),
      net_collected: this.money(totalCents - gstCents),
      month_count: month._count._all,
      month_collected: this.money(this.cents(month._sum.amount_mvr)),
      recent: recent.map((payment) => {
        const issuer = payment.created_by_user_id
          ? usersById.get(payment.created_by_user_id)
          : undefined;
        return {
          invoice_no: payment.invoice?.invoice_number ?? '',
          receipt_no: payment.receipt?.receipt_number ?? '',
          bml_reference_id: payment.bml_transaction_id ?? '',
          ticket_no: payment.invoice?.sr_number ?? '',
          amount_paid: this.money(this.amountPaidCents(payment)),
          paid_date: (payment.confirmed_at ?? payment.updated_at).toISOString(),
          issued_by: issuer?.name || issuer?.email || '',
        };
      }),
    };
  }

  async list(query: FinanceReportQuery): Promise<FinancePaymentRow[]> {
    const payments = await this.prisma.ticketPayment.findMany({
      where: this.where(query),
      include: paymentInclude,
      orderBy: { confirmed_at: 'desc' },
    });

    const usersById = await this.usersById(payments);

    const ticketIds = [
      ...new Set(payments.map((payment) => payment.crm_ticket_id)),
    ];
    const detailsByTicket = new Map<
      string,
      { category: string; customer_name: string; customer_phone: string }
    >();
    await Promise.all(
      ticketIds.map(async (ticketId) => {
        detailsByTicket.set(ticketId, await this.ticketDetails(ticketId));
      }),
    );

    const rows: FinancePaymentRow[] = [];
    for (const payment of payments) {
      const technician = payment.created_by_user_id
        ? usersById.get(payment.created_by_user_id)
        : undefined;
      const details = detailsByTicket.get(payment.crm_ticket_id);
      const base = {
        invoice_no: payment.invoice?.invoice_number ?? '',
        receipt_no: payment.receipt?.receipt_number ?? '',
        bml_reference_id: payment.bml_transaction_id ?? '',
        ticket_no:
          payment.receipt?.sr_number ?? payment.invoice?.sr_number ?? '',
        service_request_id: payment.crm_ticket_id,
        ticket_category: details?.category ?? '',
        customer_name: details?.customer_name ?? '',
        customer_phone:
          details?.customer_phone || this.paymentPhone(payment.metadata),
        paid_date: (payment.confirmed_at ?? payment.updated_at).toISOString(),
        issued_by: technician?.name || technician?.email || '',
      };
      for (const line of this.paidLines(payment)) {
        rows.push({ ...base, ...line });
      }
    }
    return rows;
  }

  toExcel(rows: FinancePaymentRow[]): string {
    const headers = [
      'Paid date',
      'Invoice no',
      'Receipt no',
      'BML reference id',
      'Ticket no',
      'Ticket category',
      'Customer name',
      'Customer phone no',
      'Product name',
      'Quantity',
      'Amount (excl. GST)',
      'GST',
      'Total paid',
      'Issued by',
    ];
    const header = headers.map((cell) => this.cell(cell)).join('');
    const body = rows
      .map((row) => {
        const cells = [
          this.cell(this.displayDate(row.paid_date)),
          this.cell(row.invoice_no),
          this.cell(row.receipt_no),
          this.cell(row.bml_reference_id),
          this.cell(row.ticket_no),
          this.cell(row.ticket_category),
          this.cell(row.customer_name),
          this.cell(row.customer_phone),
          this.cell(row.product_name),
          this.numberCell(row.quantity),
          this.numberCell(row.product_amount),
          this.numberCell(row.gst_amount),
          this.numberCell(row.total_amount),
          this.cell(row.issued_by),
        ];
        return `<Row>${cells.join('')}</Row>`;
      })
      .join('');

    const sum = (pick: (row: FinancePaymentRow) => string) =>
      this.money(rows.reduce((acc, row) => acc + this.cents(pick(row)), 0));
    const totals = rows.length
      ? `<Row>${[
          this.cell('Total'),
          ...Array.from({ length: 9 }, () => this.cell('')),
          this.numberCell(sum((row) => row.product_amount)),
          this.numberCell(sum((row) => row.gst_amount)),
          this.numberCell(sum((row) => row.total_amount)),
          this.cell(''),
        ].join('')}</Row>`
      : '';

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Paid payments">
<Table>
<Row>${header}</Row>
${body}
${totals}
</Table>
</Worksheet>
</Workbook>`;
  }

  /**
   * One row per item. GST is split across lines in proportion to their
   * amount, with the rounding remainder on the last line, so the rows of a
   * payment always add up to exactly what the customer paid.
   */
  private paidLines(
    payment: PaidPayment,
  ): Pick<
    FinancePaymentRow,
    | 'product_name'
    | 'quantity'
    | 'product_amount'
    | 'gst_amount'
    | 'total_amount'
  >[] {
    const totalCents = this.amountPaidCents(payment);
    const source = payment.receipt?.line_items ?? payment.line_items;
    const lines = this.lines(source).map((line) => ({
      name: line.label || line.code || '',
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      net: this.cents(this.lineAmount(line)),
    }));
    const netSum = lines.reduce((acc, line) => acc + line.net, 0);
    const storedTax = payment.receipt?.tax_mvr ?? payment.tax_mvr;
    const taxCents =
      storedTax != null
        ? this.cents(storedTax)
        : Math.max(0, totalCents - netSum);

    if (!lines.length || netSum <= 0) {
      return [
        {
          product_name: lines
            .map((line) => line.name)
            .filter(Boolean)
            .join(', '),
          quantity: 1,
          product_amount: this.money(totalCents - taxCents),
          gst_amount: this.money(taxCents),
          total_amount: this.money(totalCents),
        },
      ];
    }

    let allocated = 0;
    return lines.map((line, index) => {
      const gst =
        index === lines.length - 1
          ? taxCents - allocated
          : Math.round((line.net * taxCents) / netSum);
      allocated += gst;
      return {
        product_name: line.name,
        quantity: line.quantity,
        product_amount: this.money(line.net),
        gst_amount: this.money(gst),
        total_amount: this.money(line.net + gst),
      };
    });
  }

  private amountPaidCents(payment: PaidPayment): number {
    return this.cents(payment.receipt?.amount_paid_mvr ?? payment.amount_mvr);
  }

  private async usersById(payments: { created_by_user_id: string | null }[]) {
    const userIds = [
      ...new Set(
        payments
          .map((payment) => payment.created_by_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    return new Map(users.map((user) => [user.id, user]));
  }

  private where(query: FinanceReportQuery): Prisma.TicketPaymentWhereInput {
    const filters: Prisma.TicketPaymentWhereInput[] = [PAID];
    const term = query.serviceRequestId?.trim();
    if (term) {
      const contains = { contains: term, mode: 'insensitive' as const };
      filters.push({
        OR: [
          { crm_ticket_id: contains },
          { bml_transaction_id: contains },
          { invoice: { sr_number: contains } },
          { invoice: { invoice_number: contains } },
          { receipt: { is: { receipt_number: contains } } },
        ],
      });
    }
    const paidAt: Prisma.DateTimeNullableFilter = {};
    const from = this.parseDate(query.from);
    const to = this.parseDate(query.to, true);
    if (from) {
      paidAt.gte = from;
    }
    if (to) {
      paidAt.lte = to;
    }
    if (paidAt.gte || paidAt.lte) {
      filters.push({ confirmed_at: paidAt });
    }
    return { AND: filters };
  }

  /** Plain YYYY-MM-DD dates are whole days in Maldives time. */
  private parseDate(value?: string, endOfDay = false): Date | null {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`)
      : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private startOfMaldivesMonth(): Date {
    const local = new Date(Date.now() + MALDIVES_OFFSET_MS);
    return new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) -
        MALDIVES_OFFSET_MS,
    );
  }

  private cents(value: Prisma.Decimal | string | number | null | undefined) {
    const amount = Number(value?.toString() ?? 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }

  private money(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  private lines(value: Prisma.JsonValue): ChargeLine[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item) => item && typeof item === 'object',
    ) as ChargeLine[];
  }

  private lineAmount(line: ChargeLine): string {
    if (line.line_total_mvr != null && line.line_total_mvr !== '') {
      return String(line.line_total_mvr);
    }
    const unit = Number(line.unit_amount_mvr ?? line.amount_mvr ?? 0);
    const quantity = Number(line.quantity ?? 1);
    if (!Number.isFinite(unit)) {
      return '0';
    }
    return (unit * (Number.isFinite(quantity) ? quantity : 1)).toFixed(2);
  }

  private categoryCatalogPromise: Promise<Map<string, string>> | null = null;

  private async ticketDetails(crmTicketId: string): Promise<{
    category: string;
    customer_name: string;
    customer_phone: string;
  }> {
    const empty = { category: '', customer_name: '', customer_phone: '' };
    try {
      const result = await this.crm.getServiceRequest(crmTicketId);
      if (!result.ok || !result.data || typeof result.data !== 'object') {
        return empty;
      }
      const data = this.serviceRequestBody(result.data);
      const customer = this.customerFrom(data.contact);
      const named = this.categoryNames(data.categories ?? data.category);
      const unresolvedIds = this.categoryIds(data.categories ?? data.category);
      const resolved = unresolvedIds.length
        ? await this.resolveCategoryIds(unresolvedIds)
        : [];
      const names = [...named, ...resolved].filter(Boolean);
      const category = names.length
        ? [...new Set(names)].join(', ')
        : this.named(data.queue);
      return {
        category,
        customer_name: customer.name,
        customer_phone: customer.phone,
      };
    } catch {
      return empty;
    }
  }

  private customerFrom(contact: unknown): { name: string; phone: string } {
    if (!contact || typeof contact !== 'object') {
      return { name: '', phone: '' };
    }
    const record = contact as Record<string, unknown>;
    const person = record.person_name;
    const personName =
      person &&
      typeof person === 'object' &&
      typeof (person as { full_name?: unknown }).full_name === 'string'
        ? (person as { full_name: string }).full_name.trim()
        : '';
    const name =
      personName ||
      (typeof record.name === 'string' ? record.name.trim() : '') ||
      (typeof record.full_name === 'string' ? record.full_name.trim() : '');
    const phoneValue = record.phone;
    let phone = '';
    if (typeof phoneValue === 'string') {
      phone = phoneValue.trim();
    } else if (
      phoneValue &&
      typeof phoneValue === 'object' &&
      typeof (phoneValue as { number?: unknown }).number === 'string'
    ) {
      phone = (phoneValue as { number: string }).number.trim();
    }
    return { name, phone };
  }

  private paymentPhone(metadata: Prisma.JsonValue): string {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return '';
    }
    const phone = (metadata as { payment_phone?: unknown }).payment_phone;
    return typeof phone === 'string' ? phone.trim() : '';
  }

  private serviceRequestBody(data: object): Record<string, unknown> {
    const body = data as Record<string, unknown>;
    const nested = body.data ?? body.service_request ?? body.content;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    return body;
  }

  private categoryNames(raw: unknown): string[] {
    if (!raw) {
      return [];
    }
    if (typeof raw === 'string') {
      return this.looksLikeId(raw) ? [] : [raw];
    }
    if (Array.isArray(raw)) {
      return raw.flatMap((item) => this.categoryNames(item));
    }
    if (typeof raw !== 'object') {
      return [];
    }
    const obj = raw as Record<string, unknown>;
    const name = this.named(obj);
    const nested = obj.content ?? obj.categories ?? obj.items;
    const children = nested ? this.categoryNames(nested) : [];
    return name ? [name, ...children] : children;
  }

  private categoryIds(raw: unknown): string[] {
    if (!raw) {
      return [];
    }
    if (typeof raw === 'string') {
      return this.looksLikeId(raw) ? [raw] : [];
    }
    if (Array.isArray(raw)) {
      return raw.flatMap((item) => this.categoryIds(item));
    }
    if (typeof raw !== 'object') {
      return [];
    }
    const obj = raw as Record<string, unknown>;
    const id =
      typeof obj.id === 'string' && !this.named(obj) && this.looksLikeId(obj.id)
        ? [obj.id]
        : [];
    const nested = obj.content ?? obj.categories ?? obj.items;
    return [...id, ...(nested ? this.categoryIds(nested) : [])];
  }

  private async resolveCategoryIds(ids: string[]): Promise<string[]> {
    const catalog = await this.categoryCatalog();
    return ids.map((id) => catalog.get(id) ?? '').filter(Boolean);
  }

  private categoryCatalog(): Promise<Map<string, string>> {
    if (!this.categoryCatalogPromise) {
      this.categoryCatalogPromise = this.loadCategoryCatalog();
    }
    return this.categoryCatalogPromise;
  }

  private async loadCategoryCatalog(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const result = await this.crm.request(
        'GET',
        '/service_requests/categories',
      );
      if (!result.ok || !result.data) {
        this.categoryCatalogPromise = null;
        return map;
      }
      for (const item of this.flattenCatalog(result.data)) {
        if (item.id && item.name) {
          map.set(item.id, item.name);
        }
      }
    } catch {
      this.categoryCatalogPromise = null;
      return map;
    }
    return map;
  }

  private flattenCatalog(raw: unknown): { id: string; name: string }[] {
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw.flatMap((item) => this.flattenCatalog(item));
    }
    if (typeof raw !== 'object') {
      return [];
    }
    const obj = raw as Record<string, unknown>;
    const nested = obj.content ?? obj.data ?? obj.categories ?? obj.items;
    const self =
      typeof obj.id === 'string' && this.named(obj)
        ? [{ id: obj.id, name: this.named(obj) }]
        : [];
    return [...self, ...(nested ? this.flattenCatalog(nested) : [])];
  }

  private named(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return '';
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === 'string' && obj.name.trim()) {
      return obj.name.trim();
    }
    if (typeof obj.label === 'string' && obj.label.trim()) {
      return obj.label.trim();
    }
    return '';
  }

  private looksLikeId(value: string): boolean {
    return /^[0-9a-f-]{16,}$/i.test(value.trim());
  }

  private displayDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Date(date.getTime() + MALDIVES_OFFSET_MS)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
  }

  private cell(value: string): string {
    return `<Cell><Data ss:Type="String">${this.escape(value)}</Data></Cell>`;
  }

  private numberCell(value: string | number): string {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? `<Cell><Data ss:Type="Number">${amount}</Data></Cell>`
      : this.cell(String(value));
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
