import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import type { AutoAssignResult } from './assignment-engine.service';

export const AUTO_ASSIGN_CONFIG_KEY = 'dispatch.auto_assign';

export type AutoAssignSettings = {
  enabled: boolean;
  /** Per Access region team (Malé / Hulhumalé). Omitted team = auto when global enabled. */
  team_enabled?: Record<string, boolean>;
  updated_by_user_id: string | null;
  updated_at: string | null;
  last_run_at: string | null;
  last_run_summary: AutoAssignResult[] | null;
};

const DEFAULT_SETTINGS: AutoAssignSettings = {
  enabled: false,
  updated_by_user_id: null,
  updated_at: null,
  last_run_at: null,
  last_run_summary: null,
};

@Injectable()
export class AssignmentSettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: IntegrationAuditService,
  ) {}

  async getSettings(): Promise<AutoAssignSettings> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key: AUTO_ASSIGN_CONFIG_KEY },
    });
    if (!row?.value) {
      return { ...DEFAULT_SETTINGS };
    }
    const value = row.value as Partial<AutoAssignSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      enabled: Boolean(value.enabled),
    };
  }

  async isAutoAssignEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled;
  }

  isTeamAutoAssignEnabled(
    settings: AutoAssignSettings,
    teamId: string,
  ): boolean {
    if (!settings.enabled) {
      return false;
    }
    if (
      settings.team_enabled &&
      Object.prototype.hasOwnProperty.call(settings.team_enabled, teamId)
    ) {
      return Boolean(settings.team_enabled[teamId]);
    }
    return true;
  }

  async setEnabled(
    enabled: boolean,
    actorUserId: string,
    team_enabled?: Record<string, boolean>,
  ) {
    const previous = await this.getSettings();
    const next: AutoAssignSettings = {
      ...previous,
      enabled,
      team_enabled: team_enabled ?? previous.team_enabled,
      updated_by_user_id: actorUserId,
      updated_at: new Date().toISOString(),
    };

    await this.prisma.systemConfig.upsert({
      where: { key: AUTO_ASSIGN_CONFIG_KEY },
      create: { key: AUTO_ASSIGN_CONFIG_KEY, value: next as object },
      update: { value: next as object },
    });

    await this.audit.log({
      entity_type: 'dispatch',
      entity_id: AUTO_ASSIGN_CONFIG_KEY,
      action: enabled ? 'AUTO_ASSIGN_ENABLED' : 'AUTO_ASSIGN_DISABLED',
      actor_user_id: actorUserId,
      old_state: { enabled: previous.enabled },
      new_state: { enabled },
      crm_sync_ok: true,
    });

    return next;
  }

  async recordLastRun(summary: AutoAssignResult[]) {
    const current = await this.getSettings();
    const next: AutoAssignSettings = {
      ...current,
      last_run_at: new Date().toISOString(),
      last_run_summary: summary,
    };

    await this.prisma.systemConfig.upsert({
      where: { key: AUTO_ASSIGN_CONFIG_KEY },
      create: { key: AUTO_ASSIGN_CONFIG_KEY, value: next as object },
      update: { value: next as object },
    });
  }
}
