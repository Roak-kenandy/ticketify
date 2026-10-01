import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';

export const AUTO_ASSIGN_CONFIG_KEY = 'dispatch.auto_assign';

export const AUTO_ASSIGN_CATEGORIES = ['fault', 'new_connections', 'relocation'] as const;
export type AutoAssignCategory = (typeof AUTO_ASSIGN_CATEGORIES)[number];

export const CATEGORY_MODES = ['AUTO', 'MANUAL'] as const;
export type CategoryMode = (typeof CATEGORY_MODES)[number];

export const ASSIGN_STRATEGIES = ['balanced', 'least_busy', 'nearest'] as const;
export type AssignStrategy = (typeof ASSIGN_STRATEGIES)[number];

export const CATEGORY_LABELS: Record<AutoAssignCategory, string> = {
  fault: 'Fault',
  new_connections: 'New Connections',
  relocation: 'Relocation',
};

/** Maps a CRM ticket (queue name) to an auto-assign category, or null if it never auto-assigns. */
export function ticketCategory(ticket: { queue?: { name?: string } }): AutoAssignCategory | null {
  const queue = ticket?.queue?.name?.trim().toLowerCase() ?? '';
  if (queue.includes('fault')) return 'fault';
  if (queue.includes('new connection')) return 'new_connections';
  if (queue.includes('relocat')) return 'relocation';
  return null;
}

export type WaitingReason = 'no_eligible_technician' | 'all_at_capacity';

export type AssignedTicket = {
  ticket_id: string;
  number: string | null;
  category: AutoAssignCategory;
  priority: string | null;
  crm_user_id: string;
  technician_name: string | null;
};

export type WaitingTicket = {
  ticket_id: string;
  number: string | null;
  category: AutoAssignCategory;
  priority: string | null;
  team_id: string;
  reason: WaitingReason;
};

export type AutoAssignResult = {
  team_id: string;
  assigned: AssignedTicket[];
  waiting: WaitingTicket[];
  skipped: { ticket_id: string; number: string | null; reason: string }[];
  manual_count: number;
};

export type PendingAlert = WaitingTicket & { since: string };

export type AutoAssignRegion = { team_id: string; label: string; enabled: boolean };

export type AutoAssignSettings = {
  /** Master switch; categories only auto-assign while this is on. */
  enabled: boolean;
  categories: Record<AutoAssignCategory, CategoryMode>;
  strategy: AssignStrategy;
  /** Busy (yellow) technicians are normally excluded. */
  include_busy: boolean;
  /** Open jobs (assigned + in progress) a technician may hold before being skipped. 0 = no limit. */
  max_open_jobs: number;
  /** Per Access region team (Malé / Hulhumalé). Omitted team = auto when global enabled. */
  team_enabled?: Record<string, boolean>;
  updated_by_user_id: string | null;
  updated_at: string | null;
  last_run_at: string | null;
  last_run_summary: AutoAssignResult[] | null;
  pending_alerts: PendingAlert[];
};

export type AutoAssignSettingsPatch = Partial<
  Pick<
    AutoAssignSettings,
    'enabled' | 'strategy' | 'include_busy' | 'max_open_jobs' | 'team_enabled'
  >
> & { categories?: Partial<Record<AutoAssignCategory, CategoryMode>> };

const DEFAULT_SETTINGS: AutoAssignSettings = {
  enabled: false,
  categories: { fault: 'AUTO', new_connections: 'AUTO', relocation: 'AUTO' },
  strategy: 'balanced',
  include_busy: false,
  max_open_jobs: 5,
  updated_by_user_id: null,
  updated_at: null,
  last_run_at: null,
  last_run_summary: null,
  pending_alerts: [],
};

@Injectable()
export class AssignmentSettingsService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private audit: IntegrationAuditService,
  ) {}

  async getSettings(): Promise<AutoAssignSettings> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key: AUTO_ASSIGN_CONFIG_KEY },
    });
    const value = (row?.value ?? {}) as Partial<AutoAssignSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      enabled: Boolean(value.enabled),
      categories: { ...DEFAULT_SETTINGS.categories, ...(value.categories ?? {}) },
      strategy: ASSIGN_STRATEGIES.includes(value.strategy as AssignStrategy)
        ? (value.strategy as AssignStrategy)
        : DEFAULT_SETTINGS.strategy,
      pending_alerts: Array.isArray(value.pending_alerts) ? value.pending_alerts : [],
    };
  }

  async isAutoAssignEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled && this.hasAutoCategory(settings);
  }

  hasAutoCategory(settings: AutoAssignSettings): boolean {
    return AUTO_ASSIGN_CATEGORIES.some(category => settings.categories[category] === 'AUTO');
  }

  /**
   * Access regions that can auto-assign. An explicit per-team switch wins; otherwise the
   * seeded AUTO assignment policies decide (no AUTO policies at all = every region).
   */
  async regions(settings: AutoAssignSettings): Promise<AutoAssignRegion[]> {
    const policies = await this.prisma.assignmentPolicy.findMany({ where: { mode: 'AUTO' } });
    const policyTeams = policies
      .map(p => p.queue_id)
      .filter((id): id is string => Boolean(id));

    const known: { team_id: string; label: string }[] = [
      {
        team_id: this.config.get<string>('REGION_MALE_TEAM_ID') ?? 'f9006884-5b7e-4513-89ef-86e14acf0b25',
        label: 'Malé',
      },
      {
        team_id:
          this.config.get<string>('REGION_HULHUMALE_TEAM_ID') ?? '1b71e6bd-116b-4b54-854f-03e1d2d9fba6',
        label: 'Hulhumalé',
      },
    ];
    for (const team_id of policyTeams) {
      if (!known.some(region => region.team_id === team_id)) {
        known.push({ team_id, label: 'Other team' });
      }
    }

    return known.map(region => {
      const explicit = settings.team_enabled?.[region.team_id];
      return {
        ...region,
        enabled:
          typeof explicit === 'boolean'
            ? explicit
            : policyTeams.length
              ? policyTeams.includes(region.team_id)
              : true,
      };
    });
  }

  async update(patch: AutoAssignSettingsPatch, actorUserId: string) {
    const previous = await this.getSettings();
    const enabled = patch.enabled ?? previous.enabled;
    const next: AutoAssignSettings = {
      ...previous,
      enabled,
      categories: { ...previous.categories, ...(patch.categories ?? {}) },
      strategy: patch.strategy ?? previous.strategy,
      include_busy: patch.include_busy ?? previous.include_busy,
      max_open_jobs: patch.max_open_jobs ?? previous.max_open_jobs,
      team_enabled: patch.team_enabled
        ? { ...(previous.team_enabled ?? {}), ...patch.team_enabled }
        : previous.team_enabled,
      pending_alerts: enabled ? previous.pending_alerts : [],
      updated_by_user_id: actorUserId,
      updated_at: new Date().toISOString(),
    };

    await this.write(next);

    const pick = (s: AutoAssignSettings) => ({
      enabled: s.enabled,
      categories: s.categories,
      strategy: s.strategy,
      include_busy: s.include_busy,
      max_open_jobs: s.max_open_jobs,
    });
    await this.audit.log({
      entity_type: 'dispatch',
      entity_id: AUTO_ASSIGN_CONFIG_KEY,
      action:
        patch.enabled === undefined || patch.enabled === previous.enabled
          ? 'AUTO_ASSIGN_SETTINGS_UPDATED'
          : enabled
            ? 'AUTO_ASSIGN_ENABLED'
            : 'AUTO_ASSIGN_DISABLED',
      actor_user_id: actorUserId,
      old_state: pick(previous),
      new_state: pick(next),
      crm_sync_ok: true,
    });

    return next;
  }

  async recordLastRun(summary: AutoAssignResult[], pendingAlerts: PendingAlert[]) {
    const current = await this.getSettings();
    await this.write({
      ...current,
      last_run_at: new Date().toISOString(),
      last_run_summary: summary,
      pending_alerts: current.enabled ? pendingAlerts : [],
    });
  }

  private async write(value: AutoAssignSettings) {
    await this.prisma.systemConfig.upsert({
      where: { key: AUTO_ASSIGN_CONFIG_KEY },
      create: { key: AUTO_ASSIGN_CONFIG_KEY, value: value as object },
      update: { value: value as object },
    });
  }
}
