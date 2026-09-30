import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';

export type FinancePaymentRow = {
  invoice_no: string;
  bml_reference_id: string;
  ticket_no: string;
  service_request_id: string;
  ticket_category: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  product_amount: string;
  issued_date: string;
  issued_by: string;
};

type ChargeLine = {
  code?: string;
  label?: string;
  amount_mvr?: string | number;
  line_total_mvr?: string | number;
  quantity?: number;
};

export type FinanceReportQuery = {
  serviceRequestId?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class FinanceReportService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmApiClient,
  ) {}

  async summary() {
    const [invoices, payments, confirmed, pending, amountAgg, latest] =
      await Promise.all([
        this.prisma.ticketInvoice.count(),
        this.prisma.ticketPayment.count(),
        this.prisma.ticketPayment.count({ where: { status: 'CONFIRMED' } }),
        this.prisma.ticketPayment.count({ where: { status: 'PENDING' } }),
        this.prisma.ticketPayment.aggregate({ _sum: { amount_mvr: true } }),
        this.prisma.ticketPayment.findMany({
          include: { invoice: true },
          orderBy: { created_at: 'desc' },
          take: 6,
        }),
      ]);

    const userIds = [
      ...new Set(
        latest
          .map(payment => payment.created_by_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usersById = new Map(users.map(user => [user.id, user]));

    return {
      invoices,
      payments,
      confirmed,
      pending,
      total_amount: amountAgg._sum.amount_mvr?.toString() ?? '0.00',
      recent: latest.map(payment => {
        const issuer = payment.created_by_user_id
          ? usersById.get(payment.created_by_user_id)
          : undefined;
        return {
          invoice_no: payment.invoice?.invoice_number ?? '',
          bml_reference_id: payment.bml_transaction_id ?? '',
          ticket_no: payment.invoice?.sr_number ?? '',
          product_amount: payment.amount_mvr.toString(),
          issued_date: payment.created_at.toISOString(),
          issued_by: issuer?.name || issuer?.email || '',
        };
      }),
    };
  }

  async list(query: FinanceReportQuery): Promise<FinancePaymentRow[]> {
    const payments = await this.prisma.ticketPayment.findMany({
      where: this.where(query),
      include: { invoice: true },
      orderBy: { created_at: 'desc' },
    });

    const userIds = [
      ...new Set(
        payments
          .map(payment => payment.created_by_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usersById = new Map(users.map(user => [user.id, user]));

    const ticketIds = [...new Set(payments.map(payment => payment.crm_ticket_id))];
    const detailsByTicket = new Map<
      string,
      { category: string; customer_name: string; customer_phone: string }
    >();
    await Promise.all(
      ticketIds.map(async ticketId => {
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
        bml_reference_id: payment.bml_transaction_id ?? '',
        ticket_no: payment.invoice?.sr_number ?? '',
        service_request_id: payment.crm_ticket_id,
        ticket_category: details?.category ?? '',
        customer_name: details?.customer_name ?? '',
        customer_phone:
          details?.customer_phone || this.paymentPhone(payment.metadata),
        issued_date: payment.created_at.toISOString(),
        issued_by: technician?.name || technician?.email || '',
      };
      const lines = this.lines(payment.line_items);
      if (!lines.length) {
        rows.push({
          ...base,
          product_name: '',
          product_amount: payment.amount_mvr.toString(),
        });
        continue;
      }
      for (const line of lines) {
        rows.push({
          ...base,
          product_name: line.label || line.code || '',
          product_amount: this.lineAmount(line),
        });
      }
    }
    return rows;
  }

  toExcel(rows: FinancePaymentRow[]): string {
    const headers = [
      'Invoice no',
      'BML reference id',
      'Ticket no',
      'Ticket category',
      'Customer name',
      'Customer phone no',
      'Product name',
      'Product amount',
      'Issued date',
      'Issued by',
    ];
    const header = headers.map(cell => this.cell(cell)).join('');
    const body = rows
      .map(row => {
        const values = [
          row.invoice_no,
          row.bml_reference_id,
          row.ticket_no,
          row.ticket_category,
          row.customer_name,
          row.customer_phone,
          row.product_name,
          row.product_amount,
          this.displayDate(row.issued_date),
          row.issued_by,
        ];
        return `<Row>${values.map(value => this.cell(value)).join('')}</Row>`;
      })
      .join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Finance report">
<Table>
<Row>${header}</Row>
${body}
</Table>
</Worksheet>
</Workbook>`;
  }

  private where(query: FinanceReportQuery): Prisma.TicketPaymentWhereInput {
    const filters: Prisma.TicketPaymentWhereInput[] = [];
    const term = query.serviceRequestId?.trim();
    if (term) {
      filters.push({
        OR: [
          { crm_ticket_id: { contains: term, mode: 'insensitive' } },
          { invoice: { sr_number: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
    const createdAt: Prisma.DateTimeFilter = {};
    const from = this.parseDate(query.from);
    const to = this.parseDate(query.to, true);
    if (from) {
      createdAt.gte = from;
    }
    if (to) {
      createdAt.lte = to;
    }
    if (createdAt.gte || createdAt.lte) {
      filters.push({ created_at: createdAt });
    }
    return filters.length ? { AND: filters } : {};
  }

  private parseDate(value?: string, endOfDay = false): Date | null {
    if (!value?.trim()) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
  }

  private lines(value: Prisma.JsonValue): ChargeLine[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(item => item && typeof item === 'object') as ChargeLine[];
  }

  private lineAmount(line: ChargeLine): string {
    if (line.line_total_mvr != null && line.line_total_mvr !== '') {
      return String(line.line_total_mvr);
    }
    const unit = Number(line.amount_mvr ?? 0);
    const quantity = Number(line.quantity ?? 1);
    if (!Number.isFinite(unit)) {
      return String(line.amount_mvr ?? '');
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
      return raw.flatMap(item => this.categoryNames(item));
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
      return raw.flatMap(item => this.categoryIds(item));
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
    return ids.map(id => catalog.get(id) ?? '').filter(Boolean);
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

  private flattenCatalog(
    raw: unknown,
  ): { id: string; name: string }[] {
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw.flatMap(item => this.flattenCatalog(item));
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
    return date.toISOString().slice(0, 10);
  }

  private cell(value: string): string {
    return `<Cell><Data ss:Type="String">${this.escape(value)}</Data></Cell>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
