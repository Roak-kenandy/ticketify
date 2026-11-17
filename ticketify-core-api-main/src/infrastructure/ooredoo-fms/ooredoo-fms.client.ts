import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FmsAddressForm,
  FmsAssignUserOption,
  FmsSelectOption,
  FmsTicketAttachment,
  FmsTicketDetail,
  FmsTicketEditOptions,
  FmsTicketSummary,
  FMS_MEDIANET_QUEUES,
} from './ooredoo-fms.types';

/** FMS sometimes omits the current priority from the Change dropdown. */
const KNOWN_PRIORITIES: FmsSelectOption[] = [
  { id: '1', label: 'Very Urgent' },
  { id: '2', label: 'Urgent' },
  { id: '3', label: 'Regular' },
  { id: '4', label: 'Low' },
];

const DEFAULT_BASE = 'https://www.ooredoo.mv/webapps/FMS/public';
/** Detail HTML is reused across ticket + INCA snapshot + closure. */
const DETAIL_CACHE_MS = 120_000;
/** Raw ticket_info HTML kept briefly for CSRF / Change options. */
const HTML_CACHE_MS = 90_000;
/** Cap in-memory ticket details (20+ techs open many tickets). */
const MAX_DETAIL_CACHE = 120;
/** My Tickets HTML is multi‑MB — keep longer and serve stale while refreshing. */
const LIST_CACHE_MS = 120_000;
/** Serve expired list for this long while a background refresh runs. */
const LIST_STALE_MS = 10 * 60_000;
/** Prefetch My Tickets so field polls rarely hit a cold multi‑MB download. */
const LIST_PREFETCH_MS = 90_000;

@Injectable()
export class OoredooFmsClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OoredooFmsClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private cookies = new Map<string, string>();
  private loginAt = 0;
  /** One login at a time — stops the stampede that was timing out the API. */
  private loginInflight: Promise<void> | null = null;
  /** Coalesce concurrent My Tickets downloads. */
  private listInflight: Promise<FmsTicketSummary[]> | null = null;
  /** Coalesce concurrent ticket_info fetches per id. */
  private readonly detailInflight = new Map<string, Promise<FmsTicketDetail>>();
  private readonly detailCache = new Map<
    string,
    { at: number; value: FmsTicketDetail }
  >();
  private readonly htmlCache = new Map<string, { at: number; html: string }>();
  private listCache: { at: number; summaries: FmsTicketSummary[] } | null =
    null;
  private activeRequests = 0;
  private readonly waiting: Array<() => void> = [];
  private listPrefetchTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('OOREDOO_FMS_BASE_URL') ?? DEFAULT_BASE
    ).replace(/\/$/, '');
    this.timeoutMs = Number(this.config.get('OOREDOO_FMS_TIMEOUT_MS') ?? 30000);
    // Keep FMS polite under 20+ techs — raise only if Ooredoo confirms headroom.
    this.maxConcurrent = Math.max(
      1,
      Number(this.config.get('OOREDOO_FMS_MAX_CONCURRENT') ?? 4),
    );
  }

  onModuleInit() {
    if (!this.enabled()) return;
    this.listPrefetchTimer = setInterval(() => {
      void this.listAssignedSummaries({ fresh: true }).catch((error) => {
        this.logger.warn(`FMS list prefetch: ${error}`);
      });
    }, LIST_PREFETCH_MS);
    // Warm once shortly after boot so the first tech is not the cold miss.
    setTimeout(() => {
      void this.listAssignedSummaries({ fresh: true }).catch((error) => {
        this.logger.warn(`FMS list warm-up: ${error}`);
      });
    }, 5_000);
  }

  onModuleDestroy() {
    if (this.listPrefetchTimer) {
      clearInterval(this.listPrefetchTimer);
      this.listPrefetchTimer = null;
    }
  }

  enabled(): boolean {
    return this.config.get('OOREDOO_FMS_ENABLED') === 'true';
  }

  /** Shared integration login email (tech2) — like CRM_API_KEY, not a person. */
  integrationEmail(): string {
    return (this.config.get<string>('OOREDOO_FMS_EMAIL') ?? '')
      .trim()
      .toLowerCase();
  }

  medianetQueues() {
    return FMS_MEDIANET_QUEUES;
  }

  async ensureSession(): Promise<void> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException('Ooredoo FMS integration is off');
    }
    if (this.hasSession() && Date.now() - this.loginAt < 50 * 60_000) {
      return;
    }
    await this.login();
  }

  async login(): Promise<void> {
    if (this.loginInflight) {
      return this.loginInflight;
    }
    this.loginInflight = this.doLogin().finally(() => {
      this.loginInflight = null;
    });
    return this.loginInflight;
  }

  private async doLogin(): Promise<void> {
    const email = this.config.get<string>('OOREDOO_FMS_EMAIL')?.trim();
    const password = this.config.get<string>('OOREDOO_FMS_PASSWORD');
    if (!email || !password) {
      throw new ServiceUnavailableException(
        'OOREDOO_FMS_EMAIL / OOREDOO_FMS_PASSWORD are not set',
      );
    }

    // Isolate login cookies so concurrent tech requests keep the old jar until
    // auth succeeds (GET /login otherwise clobbers the shared session mid-flight).
    const previousCookies = new Map(this.cookies);
    const previousLoginAt = this.loginAt;
    this.cookies = new Map();

    try {
      const loginPage = await this.request('GET', '/login', {
        redirect: 'manual',
        duringLogin: true,
      });
      const page =
        loginPage.status >= 300 && loginPage.status < 400 && loginPage.location
          ? await this.request('GET', loginPage.location, {
              redirect: 'manual',
              duringLogin: true,
            })
          : loginPage;

      const token = this.csrfFrom(page.body) || this.cookies.get('XSRF-TOKEN');
      if (!token) {
        throw new ServiceUnavailableException(
          'FMS login page had no CSRF token',
        );
      }

      const body = new URLSearchParams({
        _token: decodeURIComponent(token),
        email,
        password,
      });
      const res = await this.request('POST', '/login', {
        body,
        form: true,
        redirect: 'manual',
        duringLogin: true,
      });
      if (this.isLoginRedirect(res) || this.isLoginHtml(res.body)) {
        throw new ServiceUnavailableException(
          'FMS login rejected — check OOREDOO_FMS_EMAIL / OOREDOO_FMS_PASSWORD (quote passwords that contain #)',
        );
      }
      if (res.status >= 300 && res.status < 400 && res.location) {
        const landing = res.location.replace(
          /^http:\/\/www\.ooredoo\.mv\//i,
          'https://www.ooredoo.mv/',
        );
        const home = await this.request('GET', landing, {
          redirect: 'manual',
          duringLogin: true,
        });
        if (this.isLoginRedirect(home) || this.isLoginHtml(home.body)) {
          throw new ServiceUnavailableException(
            'FMS login did not establish an authenticated session',
          );
        }
      } else if (res.status !== 200) {
        throw new ServiceUnavailableException(
          `FMS login failed (HTTP ${res.status})`,
        );
      }
      if (!this.hasSession()) {
        throw new ServiceUnavailableException(
          'FMS login did not return a session cookie',
        );
      }
      this.loginAt = Date.now();
      this.logger.log(
        `FMS session established as ${email} (cookies: ${[...this.cookies.keys()].join(',')})`,
      );
    } catch (error) {
      this.cookies = previousCookies;
      this.loginAt = previousLoginAt;
      throw error;
    }
  }

  async getTicket(
    ticketId: string,
    opts?: { fresh?: boolean },
  ): Promise<FmsTicketDetail> {
    const cached = this.detailCache.get(ticketId);
    if (!opts?.fresh && cached && Date.now() - cached.at < DETAIL_CACHE_MS) {
      return cached.value;
    }
    const inflight = this.detailInflight.get(ticketId);
    if (inflight && !opts?.fresh) {
      return inflight;
    }
    // Stale-while-revalidate: return last good detail while a refresh runs.
    if (!opts?.fresh && cached) {
      if (!this.detailInflight.has(ticketId)) {
        const refresh = this.fetchTicketDetail(ticketId).finally(() => {
          this.detailInflight.delete(ticketId);
        });
        this.detailInflight.set(ticketId, refresh);
        void refresh.catch((error) => {
          this.logger.warn(`FMS detail refresh ${ticketId}: ${error}`);
        });
      }
      return cached.value;
    }
    const pending = this.fetchTicketDetail(ticketId).finally(() => {
      this.detailInflight.delete(ticketId);
    });
    this.detailInflight.set(ticketId, pending);
    return pending;
  }

  private async fetchTicketDetail(ticketId: string): Promise<FmsTicketDetail> {
    await this.ensureSession();
    const res = await this.fetchAuthedHtml(
      `/tickets/ticket_info/${encodeURIComponent(ticketId)}`,
      { timeoutMs: Math.max(this.timeoutMs, 45_000) },
    );
    this.rememberHtml(ticketId, res.body);
    const detail = this.parseTicketDetail(ticketId, res.body);
    this.rememberDetail(ticketId, detail);
    return detail;
  }

  /**
   * My Tickets page only — parse table rows. Do NOT fetch ticket_info for
   * every id (300+ × ~10s was timing out the field list).
   */
  async listAssignedSummaries(opts?: {
    fresh?: boolean;
  }): Promise<FmsTicketSummary[]> {
    const now = Date.now();
    if (
      !opts?.fresh &&
      this.listCache &&
      now - this.listCache.at < LIST_CACHE_MS
    ) {
      return this.listCache.summaries;
    }
    // Stale-while-revalidate: serve expired list immediately, refresh in bg.
    if (
      !opts?.fresh &&
      this.listCache &&
      now - this.listCache.at < LIST_STALE_MS
    ) {
      if (!this.listInflight) {
        this.listInflight = this.fetchAssignedSummaries().finally(() => {
          this.listInflight = null;
        });
      }
      return this.listCache.summaries;
    }
    if (this.listInflight && !opts?.fresh) {
      return this.listInflight;
    }
    this.listInflight = this.fetchAssignedSummaries().finally(() => {
      this.listInflight = null;
    });
    return this.listInflight;
  }

  private async fetchAssignedSummaries(): Promise<FmsTicketSummary[]> {
    await this.ensureSession();
    const started = Date.now();
    const res = await this.fetchAuthedHtml('/tickets/tickets_assigned', {
      timeoutMs: Math.max(this.timeoutMs, 90_000),
    });
    const summaries = this.parseAssignedSummaries(res.body);
    this.listCache = { at: Date.now(), summaries };
    this.logger.log(
      `FMS My Tickets: ${summaries.length} row(s) in ${Date.now() - started}ms (${Math.round(res.body.length / 1024)}KB)`,
    );
    return summaries;
  }

  /**
   * GET HTML while following non-login redirects and re-authing once if needed.
   * FMS often 302s (trailing slash / https) — `redirect:manual` alone was
   * treating those as failures and returning an empty ticket list.
   */
  private async fetchAuthedHtml(
    path: string,
    opts?: { timeoutMs?: number; retries?: number },
  ): Promise<{ status: number; body: string; url: string }> {
    const timeoutMs = opts?.timeoutMs ?? this.timeoutMs;
    let retries = opts?.retries ?? 1;
    let next: string = path;
    for (let hop = 0; hop < 6; hop++) {
      const res = await this.request('GET', next, {
        redirect: 'manual',
        timeoutMs,
      });
      if (this.isLoginRedirect(res) || this.isLoginHtml(res.body)) {
        if (retries <= 0) {
          throw new ServiceUnavailableException(
            `FMS auth failed for ${path}`,
          );
        }
        retries -= 1;
        await this.login();
        next = path;
        continue;
      }
      if (res.status >= 300 && res.status < 400 && res.location) {
        this.logger.debug(
          `FMS redirect ${res.status} ${next} → ${res.location}`,
        );
        next = res.location;
        continue;
      }
      if (res.status !== 200) {
        throw new ServiceUnavailableException(
          `FMS ${path} failed (HTTP ${res.status})`,
        );
      }
      if (this.isLoginHtml(res.body)) {
        if (retries <= 0) {
          throw new ServiceUnavailableException(
            `FMS auth failed for ${path}`,
          );
        }
        retries -= 1;
        await this.login();
        next = path;
        continue;
      }
      return res;
    }
    throw new ServiceUnavailableException(
      `FMS ${path} exceeded redirect limit`,
    );
  }

  async listAssignedIds(opts?: { fresh?: boolean }): Promise<string[]> {
    const summaries = await this.listAssignedSummaries(opts);
    return summaries.map((s) => s.id);
  }

  /** @deprecated Prefer listAssignedSummaries — kept for callers that need details. */
  async listAssigned(): Promise<FmsTicketDetail[]> {
    const ids = await this.listAssignedIds();
    // Cap enrichment — full parallel fetch of hundreds of tickets times out.
    return this.getTicketsParallel(ids.slice(0, 20), 4);
  }

  async getTicketsParallel(
    ids: string[],
    concurrency = 4,
  ): Promise<FmsTicketDetail[]> {
    const details: FmsTicketDetail[] = [];
    let index = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(ids.length, 1)) },
      async () => {
        while (index < ids.length) {
          const id = ids[index++];
          try {
            details.push(await this.getTicket(id));
          } catch (error) {
            this.logger.warn(`FMS ticket ${id} skipped: ${error}`);
          }
        }
      },
    );
    await Promise.all(workers);
    return details;
  }

  parseAssignedIds(html: string): string[] {
    return this.parseAssignedSummaries(html).map((s) => s.id);
  }

  parseAssignedSummaries(html: string): FmsTicketSummary[] {
    const out: FmsTicketSummary[] = [];
    const seen = new Set<string>();
    const rowRe =
      /<tr[^>]*>[\s\S]*?tickets\/ticket_info\/(\d{3,12})[\s\S]*?<\/tr>/gi;
    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(html))) {
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const row = match[0];
      const cells = this.rowCells(row);
      const aging = cells.get('Aging') || cells.get('Queue Aging') || '';
      const closed = /closed/i.test(aging) || /close/i.test(cells.get('Priority') || '');
      const categories = [...row.matchAll(/data-label=["']Category["'][^>]*>([\s\S]*?)<\/td>/gi)]
        .map((m) => this.stripHtml(m[1]))
        .filter(Boolean);
      out.push({
        id,
        queue: cells.get('Queue') || null,
        status: closed ? 'Fault Resolved' : 'Open',
        // "Name" column is assignee (Cloudflare-obfuscated); read from raw row HTML.
        assignee_email: this.emailFromHtml(row),
        account_number: cells.get('Account ID') || null,
        serial_number: null,
        customer_name: cells.get('Account ID') || null,
        // List card body uses sub-category; keep main category separate.
        description: categories[1] || categories[0] || null,
        created_at: cells.get('Date') || null,
        priority: cells.get('Priority') || null,
        category: categories[0] || null,
        sub_category: categories[1] || null,
      });
    }
    return out;
  }

  private rowCells(rowHtml: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /data-label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rowHtml))) {
      const label = m[1].trim();
      const value = this.stripHtml(m[2]).replace(/\s+/g, ' ').trim();
      // Keep first value for duplicate labels (Category appears twice).
      if (!map.has(label)) map.set(label, value);
    }
    return map;
  }

  private emailFromHtml(html: string): string | null {
    const cf = html.match(/data-cfemail=["']([a-f0-9]+)["']/i);
    if (cf?.[1]) return this.decodeCfEmail(cf[1]);
    const plain = this.stripHtml(html);
    return plain.includes('@') ? plain.split(/\s+/)[0] : null;
  }

  toSummary(detail: FmsTicketDetail): FmsTicketSummary {
    return {
      id: detail.id,
      queue: detail.queue,
      status: detail.status,
      assignee_email: detail.assignee_email,
      account_number: detail.account_number,
      serial_number: detail.serial_number,
      customer_name: detail.customer_name,
      description: detail.description,
      created_at: detail.created_at,
    };
  }

  async assignUser(
    ticketId: string,
    userId: string,
    comment: string,
  ): Promise<void> {
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const body = new URLSearchParams({
      _token: token,
      ticket_id: ticketId,
      user_id: userId,
      comment,
    });
    const res = await this.request('POST', '/tickets/post_user_assign', {
      body,
      form: true,
      redirect: 'manual',
    });
    this.invalidateTicket(ticketId, { list: true });
    if (
      res.status !== 302 &&
      res.status !== 200 &&
      !this.isLoginRedirect(res)
    ) {
      throw new ServiceUnavailableException(
        `FMS assign failed (HTTP ${res.status})`,
      );
    }
  }

  async addComment(ticketId: string, comment: string): Promise<void> {
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const body = new URLSearchParams({
      _token: token,
      ticket_id: ticketId,
      comment,
      comment_type: 'internal',
    });
    const res = await this.request('POST', '/tickets/comment_info', {
      body,
      form: true,
      redirect: 'manual',
    });
    // Comments do not change the My Tickets table — keep the warm list cache.
    this.invalidateTicket(ticketId);
    if (
      res.status !== 302 &&
      res.status !== 200 &&
      !this.isLoginRedirect(res)
    ) {
      throw new ServiceUnavailableException(
        `FMS comment failed (HTTP ${res.status})`,
      );
    }
  }

  async changeStatus(
    ticketId: string,
    ticketStatus: number,
    closingSubComment: string,
    comment: string,
  ): Promise<void> {
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const body = new URLSearchParams({
      _token: token,
      ticket_id: ticketId,
      ticket_status: String(ticketStatus),
      ticket_sub_comment: closingSubComment,
      comment,
    });
    const res = await this.request('POST', '/tickets/Change_Ticket_Status', {
      body,
      form: true,
      redirect: 'manual',
    });
    this.invalidateTicket(ticketId, { list: true });
    if (
      res.status !== 302 &&
      res.status !== 200 &&
      !this.isLoginRedirect(res)
    ) {
      throw new ServiceUnavailableException(
        `FMS status change failed (HTTP ${res.status})`,
      );
    }
  }

  async assignableUsers(ticketId: string): Promise<FmsAssignUserOption[]> {
    const html = await this.ticketInfoHtml(ticketId);
    return this.parseAssignUsers(html);
  }

  private assigneeDirectoryCache: {
    at: number;
    items: FmsAssignUserOption[];
  } | null = null;

  /**
   * Global-ish Assign-to-User list for admin create dropdowns.
   * FMS only exposes assignees on a ticket page — use any MediaNet ticket.
   */
  async listDirectoryAssignees(): Promise<FmsAssignUserOption[]> {
    const cached = this.assigneeDirectoryCache;
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      return cached.items;
    }
    const summaries = await this.listAssignedSummaries();
    const ticketId = summaries[0]?.id;
    if (!ticketId) {
      throw new ServiceUnavailableException(
        'No FMS tickets available to load the Assign-to-User list',
      );
    }
    const items = await this.assignableUsers(ticketId);
    this.assigneeDirectoryCache = { at: Date.now(), items };
    return items;
  }

  /** Options for the FMS Change popups on this ticket (status set is type-dependent). */
  async getEditOptions(ticketId: string): Promise<FmsTicketEditOptions> {
    const html = await this.ticketInfoHtml(ticketId);
    const priorities = this.mergeOptions(
      this.parseSelectOptions(html, 'priority_id'),
      KNOWN_PRIORITIES,
    );
    return {
      ticket_id: ticketId,
      priorities,
      statuses: this.parseSelectOptions(html, 'ticket_status'),
      status_sub_comments: this.parseSelectOptions(html, 'ticket_sub_comment'),
      queues: this.parseSelectOptions(html, 'que_id'),
      queue_subcats: this.parseSelectOptions(html, 't_subcat'),
      categories: this.parseSelectOptions(html, 'category').filter(
        (opt) => opt.id !== '0',
      ),
      assignees: this.parseAssignUsers(html),
    };
  }

  async listSubCategories(
    categoryId: string,
  ): Promise<FmsSelectOption[]> {
    await this.ensureSession();
    // JSON endpoint — Accept is still HTML-safe; FMS returns application/json.
    const res = await this.request(
      'GET',
      `/get/sub_category/${encodeURIComponent(categoryId)}`,
      {
        redirect: 'manual',
        timeoutMs: Math.max(this.timeoutMs, 30_000),
      },
    );
    if (this.isLoginRedirect(res) || this.isLoginHtml(res.body)) {
      await this.login();
      return this.listSubCategories(categoryId);
    }
    if (res.status !== 200) {
      throw new ServiceUnavailableException(
        `FMS sub-categories failed (HTTP ${res.status})`,
      );
    }
    try {
      const data = JSON.parse(res.body) as Array<{
        subcategory_id?: number | string;
        name?: string;
      }>;
      if (!Array.isArray(data)) return [];
      return data
        .map((row) => ({
          id: String(row.subcategory_id ?? ''),
          label: String(row.name ?? '').trim(),
        }))
        .filter((row) => row.id && row.label);
    } catch {
      throw new ServiceUnavailableException(
        'FMS sub-categories response was not JSON',
      );
    }
  }

  async setPriority(
    ticketId: string,
    priorityId: string,
    comment: string,
  ): Promise<void> {
    await this.postTicketForm('/tickets/priority_info', {
      ticket_id: ticketId,
      priority_id: priorityId,
      comment,
    });
  }

  async setQueue(
    ticketId: string,
    queueId: string,
    queueSubcatId: string,
    comment: string,
  ): Promise<void> {
    await this.postTicketForm('/tickets/que_info', {
      ticket_id: ticketId,
      que_id: queueId,
      t_subcat: queueSubcatId,
      comment,
    });
  }

  async setCategory(
    ticketId: string,
    categoryId: string,
    subCategoryId: string,
    comment: string,
  ): Promise<void> {
    await this.postTicketForm('/tickets/category_info', {
      ticket_id: ticketId,
      category: categoryId,
      sub_category: subCategoryId,
      comment,
    });
  }

  async getAddressForm(ticketId: string): Promise<FmsAddressForm> {
    const html = await this.ticketInfoHtml(ticketId);
    return this.parseAddressForm(ticketId, html);
  }

  async listIslands(atollId: string): Promise<FmsSelectOption[]> {
    await this.ensureSession();
    const res = await this.request(
      'GET',
      `/get/bscs_island/${encodeURIComponent(atollId)}`,
      { redirect: 'manual', timeoutMs: Math.max(this.timeoutMs, 30_000) },
    );
    if (this.isLoginRedirect(res) || this.isLoginHtml(res.body)) {
      await this.login();
      return this.listIslands(atollId);
    }
    if (res.status !== 200) {
      throw new ServiceUnavailableException(
        `FMS islands failed (HTTP ${res.status})`,
      );
    }
    try {
      const data = JSON.parse(res.body) as Array<{
        country_code?: string;
        country_description?: string;
      }>;
      if (!Array.isArray(data)) return [];
      return data
        .map((row) => ({
          id: String(row.country_code ?? '').trim(),
          label: String(row.country_description ?? '').trim(),
        }))
        .filter((row) => row.id && row.id !== '0' && row.label);
    } catch {
      throw new ServiceUnavailableException('FMS islands response was not JSON');
    }
  }

  /**
   * Relocation destination address. Identity fields (name/mobile/email) are always
   * taken from the current FMS form — callers cannot clear or replace them.
   */
  async updateInstallationAddress(
    ticketId: string,
    address: {
      address1: string;
      address2?: string;
      street: string;
      company?: string;
      zip?: string;
      country_id: string;
      atoll_id: string;
      island_id: string;
    },
  ): Promise<void> {
    const form = await this.getAddressForm(ticketId);
    if (!form.can_edit) {
      throw new ServiceUnavailableException(
        'Address updates are only available on Relocation tickets',
      );
    }
    if (!form.account_id) {
      throw new ServiceUnavailableException(
        'FMS ticket is missing account id for address update',
      );
    }
    if (!form.firstname.trim() || !form.mobile.trim()) {
      throw new ServiceUnavailableException(
        'FMS customer name/mobile is missing — cannot update address safely',
      );
    }
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const body = new URLSearchParams({
      _token: token,
      ticket_id: ticketId,
      account_id: form.account_id,
      contract_type: form.contract_type || 'postpaid',
      firstname: form.firstname,
      middlename: form.middlename,
      lastname: form.lastname,
      mobile: form.mobile,
      phone_home: form.phone_home,
      phone_work: form.phone_work,
      email: form.email,
      address1: address.address1.trim(),
      address2: (address.address2 ?? '').trim(),
      street: address.street.trim(),
      company: (address.company ?? form.company ?? '').trim(),
      zip: (address.zip ?? form.zip ?? '').trim(),
      country: address.country_id.trim(),
      atoll: address.atoll_id.trim(),
      island: address.island_id.trim(),
    });
    const res = await this.request('POST', '/tickets/post_new_installation_address', {
      body,
      form: true,
      redirect: 'manual',
      timeoutMs: Math.max(this.timeoutMs, 60_000),
    });
    this.invalidateTicket(ticketId, { list: true });
    if (
      res.status !== 302 &&
      res.status !== 200 &&
      !this.isLoginRedirect(res)
    ) {
      throw new ServiceUnavailableException(
        `FMS address update failed (HTTP ${res.status})`,
      );
    }
  }

  /** Fetch an FMS-hosted attachment using the tech2 session (for mPro proxy). */
  async downloadAttachment(
    fileUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    await this.ensureSession();
    return this.limited(async () => {
      const url = fileUrl.startsWith('http')
        ? fileUrl
        : `${this.baseUrl.replace(/\/public$/, '')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
      const headers: Record<string, string> = {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      const cookie = [...this.cookies.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      if (cookie) headers.Cookie = cookie;
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(this.timeoutMs, 60_000),
      );
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });
        this.captureCookiesFromResponse(res);
        if (res.status !== 200) {
          throw new ServiceUnavailableException(
            `FMS attachment download failed (HTTP ${res.status})`,
          );
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType =
          res.headers.get('content-type') || 'application/octet-stream';
        return { buffer, contentType };
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async uploadTicketAttachment(
    ticketId: string,
    file: {
      buffer: Buffer;
      mimetype?: string;
      originalname?: string;
    },
    comment: string,
  ): Promise<void> {
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const form = new FormData();
    form.append('_token', token);
    form.append('ticket_id', ticketId);
    form.append('comment', comment);
    form.append('comment_type', 'internal');
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || 'application/octet-stream',
    });
    form.append('document', blob, file.originalname || 'photo.jpg');

    await this.limited(async () => {
      const url = `${this.baseUrl}/tickets/post_ticket_attachment`;
      const headers: Record<string, string> = {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      const cookie = [...this.cookies.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      if (cookie) headers.Cookie = cookie;

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(this.timeoutMs, 90_000),
      );
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: form,
          redirect: 'manual',
          signal: controller.signal,
        });
        this.captureCookiesFromResponse(res);
        this.invalidateTicket(ticketId);
        if (
          res.status !== 302 &&
          res.status !== 200 &&
          !this.isLoginRedirect({
            status: res.status,
            url: res.url,
            location: res.headers.get('location'),
          })
        ) {
          throw new ServiceUnavailableException(
            `FMS attachment upload failed (HTTP ${res.status})`,
          );
        }
      } finally {
        clearTimeout(timer);
      }
    });
  }

  private async ticketInfoHtml(ticketId: string): Promise<string> {
    const cached = this.htmlCache.get(ticketId);
    if (cached && Date.now() - cached.at < HTML_CACHE_MS) {
      return cached.html;
    }
    await this.ensureSession();
    const res = await this.fetchAuthedHtml(
      `/tickets/ticket_info/${encodeURIComponent(ticketId)}`,
      { timeoutMs: Math.max(this.timeoutMs, 45_000) },
    );
    this.rememberHtml(ticketId, res.body);
    // Keep detail cache in sync when HTML is fetched for options/CSRF.
    try {
      this.rememberDetail(ticketId, this.parseTicketDetail(ticketId, res.body));
    } catch {
      /* parse best-effort */
    }
    return res.body;
  }

  private async postTicketForm(
    path: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const ticketId = fields.ticket_id;
    await this.ensureSession();
    const token = await this.csrfForTicket(ticketId);
    const body = new URLSearchParams({ _token: token, ...fields });
    const res = await this.request('POST', path, {
      body,
      form: true,
      redirect: 'manual',
    });
    this.invalidateTicket(ticketId, { list: true });
    if (
      res.status !== 302 &&
      res.status !== 200 &&
      !this.isLoginRedirect(res)
    ) {
      throw new ServiceUnavailableException(
        `FMS ${path} failed (HTTP ${res.status})`,
      );
    }
  }

  private parseSelectOptions(html: string, name: string): FmsSelectOption[] {
    const re = new RegExp(
      `<select[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</select>`,
      'i',
    );
    const block = html.match(re)?.[1];
    if (!block) return [];
    const out: FmsSelectOption[] = [];
    const optionRe =
      /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let m: RegExpExecArray | null;
    while ((m = optionRe.exec(block))) {
      const id = m[1]?.trim();
      const label = this.stripHtml(m[2]).replace(/\s+/g, ' ').trim();
      if (!id || !label) continue;
      out.push({ id, label });
    }
    return out;
  }

  private mergeOptions(
    primary: FmsSelectOption[],
    extras: FmsSelectOption[],
  ): FmsSelectOption[] {
    const byId = new Map<string, FmsSelectOption>();
    for (const opt of [...extras, ...primary]) {
      byId.set(opt.id, opt);
    }
    return [...byId.values()].sort(
      (a, b) => Number(a.id) - Number(b.id) || a.label.localeCompare(b.label),
    );
  }

  private async csrfForTicket(ticketId: string): Promise<string> {
    // Prefer warm ticket_info HTML — avoids a second multi‑KB GET on every write.
    const cached = this.htmlCache.get(ticketId);
    if (cached && Date.now() - cached.at < HTML_CACHE_MS) {
      const fromHtml = this.csrfFrom(cached.html);
      if (fromHtml) return decodeURIComponent(fromHtml);
    }
    const cookieToken = this.cookies.get('XSRF-TOKEN');
    if (cookieToken) {
      return decodeURIComponent(cookieToken);
    }
    const html = await this.ticketInfoHtml(ticketId);
    const token = this.csrfFrom(html) || this.cookies.get('XSRF-TOKEN');
    if (!token) {
      throw new ServiceUnavailableException('FMS page had no CSRF token');
    }
    return decodeURIComponent(token);
  }

  /** Drop ticket detail/HTML; optionally age the list so SWR refreshes without a cold miss. */
  private invalidateTicket(ticketId: string, opts?: { list?: boolean }) {
    this.detailCache.delete(ticketId);
    this.htmlCache.delete(ticketId);
    if (opts?.list) {
      this.markListStale();
    }
  }

  private markListStale() {
    if (!this.listCache) return;
    // Expire fresh TTL but keep the payload for stale-while-revalidate.
    this.listCache = {
      at: Date.now() - LIST_CACHE_MS - 1,
      summaries: this.listCache.summaries,
    };
  }

  private rememberHtml(ticketId: string, html: string) {
    if (this.htmlCache.size >= MAX_DETAIL_CACHE) {
      const oldest = this.htmlCache.keys().next().value;
      if (oldest !== undefined) this.htmlCache.delete(oldest);
    }
    this.htmlCache.set(ticketId, { at: Date.now(), html });
  }

  private rememberDetail(ticketId: string, detail: FmsTicketDetail) {
    if (this.detailCache.size >= MAX_DETAIL_CACHE) {
      const oldest = this.detailCache.keys().next().value;
      if (oldest !== undefined) this.detailCache.delete(oldest);
    }
    this.detailCache.set(ticketId, { at: Date.now(), value: detail });
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.activeRequests += 1;
    try {
      return await task();
    } finally {
      this.activeRequests -= 1;
      this.waiting.shift()?.();
    }
  }

  private hasSession(): boolean {
    for (const name of this.cookies.keys()) {
      if (/session/i.test(name) || name === 'fms_session') return true;
    }
    return this.cookies.size > 0 && this.loginAt > 0;
  }

  private isLoginRedirect(res: {
    status: number;
    url: string;
    location?: string | null;
  }): boolean {
    // Only the Location header matters. `res.url` is often still `/login`
    // when we POST with redirect:manual — that was falsely rejecting good logins.
    if (res.status === 302 || res.status === 301 || res.status === 303) {
      return /\/login(?:\?|$)/i.test(res.location || '');
    }
    return false;
  }

  /** FMS sometimes returns HTTP 200 with the login form instead of a 302. */
  private isLoginHtml(body: string): boolean {
    return (
      /name=["']password["']/i.test(body) &&
      /name=["']email["']/i.test(body) &&
      /\/login/i.test(body)
    );
  }

  private csrfFrom(html: string): string | null {
    const meta = html.match(
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
    );
    if (meta?.[1]) return meta[1];
    const input = html.match(/name=["']_token["']\s+value=["']([^"']+)["']/i);
    return input?.[1] ?? null;
  }

  private parseAssignUsers(html: string): FmsAssignUserOption[] {
    const modal = html.match(
      /id=["']Assign_user_Modal["'][\s\S]*?<\/form>/i,
    )?.[0];
    if (!modal) return [];
    const out: FmsAssignUserOption[] = [];
    const optionRe =
      /<option\s+value=["'](\d+)["'][^>]*>[\s\S]*?data-cfemail=["']([a-f0-9]+)["'][\s\S]*?<\/option>/gi;
    let m: RegExpExecArray | null;
    while ((m = optionRe.exec(modal))) {
      out.push({ id: m[1], email: this.decodeCfEmail(m[2]) });
    }
    if (out.length) return out;
    const plainRe =
      /<option\s+value=["'](\d+)["'][^>]*>\s*([^<]+)\s*<\/option>/gi;
    while ((m = plainRe.exec(modal))) {
      const email = m[2].trim();
      if (email.includes('@')) out.push({ id: m[1], email });
    }
    return out;
  }

  private parseTicketDetail(ticketId: string, html: string): FmsTicketDetail {
    const field = (label: string) => this.labeledValue(html, label);
    const install = this.installationAddressBlock(html);
    const installField = (label: string) =>
      install ? this.labeledValue(install, label) : null;
    const comments: FmsTicketDetail['comments'] = [];
    const commentBlock = html.match(
      /id=["']internalcommentlink1["'][\s\S]*?<\/tbody>/i,
    )?.[0];
    if (commentBlock) {
      const rowRe =
        /<tr[^>]*>[\s\S]*?data-label=["']User["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?data-label=["']Comment["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?data-label=["']Date["'][^>]*>([\s\S]*?)<\/td>/gi;
      let row: RegExpExecArray | null;
      while ((row = rowRe.exec(commentBlock))) {
        comments.push({
          user: this.stripHtml(row[1]),
          comment: this.stripHtml(row[2]),
          at: this.stripHtml(row[3]),
        });
      }
    }

    return {
      id: field('Ticket ID') || ticketId,
      type: field('Ticket Type') || this.afterTitle(html, 'Ticket Type:'),
      category: field('Ticket Category'),
      sub_category: field('Ticket Sub Category'),
      priority: field('Priority')?.split('|')[0]?.trim() ?? null,
      status: field('TT - Status')?.split('|')[0]?.trim() ?? null,
      queue: field('Queue')?.split('|')[0]?.trim() ?? null,
      partner: field('Partner'),
      region: field('Assigned Region'),
      assignee_email: this.assigneeEmail(html),
      account_number: field('Account Number'),
      serial_number: field('Serial Number'),
      customer_name: installField('Name') || field('Name'),
      customer_contact:
        field('Customer Contact') ||
        installField('Contact') ||
        field('Contact'),
      salesforce_id: field('Salesforce Ticket ID'),
      description:
        field('Description') || this.namedControl(html, 'problem_description'),
      created_at: field('Ticket Creation Date'),
      address_line_1: installField('Address'),
      address_line_2: installField('Address 2'),
      street: installField('Street'),
      atoll: installField('Atoll') || installField('Island'),
      comments,
      attachments: this.parseAttachments(html),
    };
  }

  private parseAttachments(html: string): FmsTicketAttachment[] {
    const section = html.match(
      /id=["']ticket_attachments["'][\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
    )?.[1];
    if (!section) return [];
    const out: FmsTicketAttachment[] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let row: RegExpExecArray | null;
    let index = 0;
    while ((row = rowRe.exec(section))) {
      const cells = [
        ...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
      ].map((c) => c[1]);
      if (cells.length < 3) continue;
      const user = this.stripHtml(cells[0] ?? '');
      const comment = this.stripHtml(cells[1] ?? '');
      const fileHtml = cells[2] ?? '';
      const href = fileHtml.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
      const fileName =
        this.stripHtml(fileHtml) ||
        (href ? href.split('/').pop() || null : null);
      const at = this.stripHtml(cells[3] ?? '') || null;
      if (!comment && !fileName && !href) continue;
      const absUrl = href
        ? href.startsWith('http')
          ? href
          : `${this.baseUrl.replace(/\/public$/, '')}${href.startsWith('/') ? '' : '/'}${href}`
        : null;
      out.push({
        id: `fmsfile_${index++}_${Buffer.from(
          `${fileName ?? ''}|${at ?? ''}|${comment ?? ''}`,
        )
          .toString('base64url')
          .slice(0, 24)}`,
        user: user || null,
        comment: comment || null,
        file_name: fileName,
        file_url: absUrl,
        at,
      });
    }
    return out;
  }

  private parseAddressForm(ticketId: string, html: string): FmsAddressForm {
    const detail = this.parseTicketDetail(ticketId, html);
    const canEdit = /relocat/i.test(
      `${detail.category ?? ''} ${detail.type ?? ''} ${detail.sub_category ?? ''}`,
    );
    const newForm =
      html.match(
        /<form[^>]*action=["'][^"']*post_new_installation_address["'][^>]*>([\s\S]*?)<\/form>/i,
      )?.[1] ?? '';
    const inputVal = (name: string) => {
      const tag = newForm.match(
        new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, 'i'),
      )?.[0];
      return tag?.match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    };
    const countries = this.parseSelectOptions(newForm, 'country').filter(
      (opt) => opt.id && opt.id !== '0',
    );
    const atolls = this.parseSelectOptions(newForm, 'atoll').filter(
      (opt) => opt.id && opt.id !== '0',
    );
    const selectedVal = (name: string) => {
      const block = newForm.match(
        new RegExp(
          `<select[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/select>`,
          'i',
        ),
      )?.[1];
      if (!block) return inputVal(name);
      return (
        block.match(/<option[^>]*selected[^>]*value=["']([^"']*)["']/i)?.[1] ??
        block.match(/<option[^>]*value=["']([^"']*)["'][^>]*selected/i)?.[1] ??
        inputVal(name)
      );
    };
    const maldives =
      selectedVal('country') ||
      countries.find((c) => /maldiv/i.test(c.label))?.id ||
      '130';
    return {
      ticket_id: ticketId,
      can_edit: canEdit,
      account_id: inputVal('account_id') || detail.account_number || null,
      contract_type: inputVal('contract_type') || 'postpaid',
      firstname: inputVal('firstname'),
      lastname: inputVal('lastname'),
      middlename: inputVal('middlename'),
      mobile: inputVal('mobile') || detail.customer_contact || '',
      email: inputVal('email'),
      phone_home: inputVal('phone_home'),
      phone_work: inputVal('phone_work'),
      address1: detail.address_line_1 || inputVal('address1'),
      address2: detail.address_line_2 || inputVal('address2'),
      street: detail.street || inputVal('street'),
      company: inputVal('company'),
      zip: inputVal('zip'),
      country_id: maldives,
      atoll_id: selectedVal('atoll'),
      island_id: selectedVal('island'),
      atolls,
      countries: countries.length
        ? countries
        : [{ id: '130', label: 'Maldives' }],
    };
  }

  /** Prefer the read-only "Customer Installation Address" card over editable forms. */
  private installationAddressBlock(html: string): string | null {
    const match = html.match(
      /Customer Installation Address[\s\S]*?(?=Installation Address Details|Ticket Details|<hr|$)/i,
    );
    return match?.[0] ?? null;
  }

  private assigneeEmail(html: string): string | null {
    const block = html.match(
      /Currently Assigned to[\s\S]{0,400}?data-cfemail=["']([a-f0-9]+)["']/i,
    );
    if (block?.[1]) {
      return this.decodeCfEmail(block[1]);
    }
    const plain = this.labeledValue(html, 'Currently Assigned to');
    if (!plain || /^-\s*none/i.test(plain) || plain === '-') {
      return null;
    }
    const email = plain.split('|')[0]?.trim();
    return email?.includes('@') ? email : null;
  }

  private labeledValue(html: string, label: string): string | null {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `>\\s*${escaped}\\s*<\\/p>[\\s\\S]*?<p[^>]*>\\s*([\\s\\S]*?)\\s*<\\/p>`,
      'i',
    );
    const m = html.match(re);
    if (!m?.[1]) return null;
    const text = this.stripHtml(m[1]).replace(/\s+/g, ' ').trim();
    return text && text !== '-' ? text : null;
  }

  private afterTitle(html: string, prefix: string): string | null {
    const re = new RegExp(
      `${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*([^<]+)`,
      'i',
    );
    const m = html.match(re);
    return m?.[1]?.trim() || null;
  }

  private namedControl(html: string, name: string): string | null {
    const re = new RegExp(`name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i');
    const m = html.match(re);
    return m?.[1] ? this.stripHtml(m[1]) : null;
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/\[email&#160;protected\]/gi, '')
      .trim();
  }

  private decodeCfEmail(hex: string): string {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return out;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    opts: {
      body?: URLSearchParams;
      form?: boolean;
      redirect?: RequestRedirect;
      timeoutMs?: number;
      /** Login flow owns the cookie jar — do not wait on loginInflight. */
      duringLogin?: boolean;
    } = {},
  ): Promise<{
    status: number;
    body: string;
    url: string;
    location: string | null;
  }> {
    if (!opts.duringLogin && this.loginInflight) {
      await this.loginInflight;
    }
    // Login must not take a concurrency slot — callers may already hold one
    // while awaiting re-auth (would deadlock at maxConcurrent).
    if (opts.duringLogin) {
      return this.rawRequest(method, path, opts);
    }
    return this.limited(() => this.rawRequest(method, path, opts));
  }

  private async rawRequest(
    method: 'GET' | 'POST',
    path: string,
    opts: {
      body?: URLSearchParams;
      form?: boolean;
      redirect?: RequestRedirect;
      timeoutMs?: number;
    } = {},
  ): Promise<{
    status: number;
    body: string;
    url: string;
    location: string | null;
  }> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      // Let Node decompress gzip — FMS My Tickets HTML is multi‑MB uncompressed.
      'Accept-Encoding': 'gzip, deflate, br',
      // Browser-like UA — FMS/Cloudflare was flaky with a custom bot UA.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    const cookie = [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookie) headers.Cookie = cookie;
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? this.timeoutMs,
    );
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: opts.body,
        redirect: opts.redirect ?? 'manual',
        signal: controller.signal,
      });
      this.captureCookiesFromResponse(res);
      const body = await res.text();
      return {
        status: res.status,
        body,
        url: res.url,
        location: res.headers.get('location'),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private captureCookiesFromResponse(res: Response) {
    const fromHelper =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [];
    if (fromHelper.length) {
      this.captureCookies(fromHelper);
      return;
    }
    // Node/undici sometimes only exposes a single joined header.
    const single = res.headers.get('set-cookie');
    if (single) {
      this.captureCookies(single.split(/,(?=\s*[^;=]+=)/));
    }
  }

  private captureCookies(setCookies: string[]) {
    for (const raw of setCookies) {
      const part = raw.split(';')[0];
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }
}
