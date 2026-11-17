import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { OoredooFmsClient } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.client';

export type DirectoryOption = {
  id: string;
  label: string;
  email?: string | null;
};

/** CRM / FMS staff directories for admin user create dropdowns. */
@Injectable()
export class AdminDirectoryService {
  constructor(
    private readonly crm: CrmApiClient,
    private readonly fms: OoredooFmsClient,
  ) {}

  async crmTeams(): Promise<{ items: DirectoryOption[] }> {
    const items: DirectoryOption[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await this.crm.listTeams(page, 50);
      if (!res.ok) {
        throw new ServiceUnavailableException(
          `CRM teams failed (HTTP ${res.status})`,
        );
      }
      const batch = res.data?.content ?? [];
      for (const team of batch) {
        if (!team?.id) continue;
        items.push({
          id: String(team.id),
          label: String(team.name ?? team.id).trim() || String(team.id),
        });
      }
      if (batch.length < 50) break;
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return { items };
  }

  async crmUsers(teamId: string): Promise<{ items: DirectoryOption[] }> {
    if (!teamId?.trim()) {
      throw new BadRequestException('Choose a CRM team');
    }
    const items: DirectoryOption[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await this.crm.listTeamUsers(teamId.trim(), page, 100);
      if (!res.ok) {
        throw new ServiceUnavailableException(
          `CRM team users failed (HTTP ${res.status})`,
        );
      }
      const batch = res.data?.content ?? [];
      for (const user of batch) {
        if (!user?.id) continue;
        const name = [user.first_name, user.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        const email =
          typeof (user as { email?: string }).email === 'string'
            ? String((user as { email?: string }).email).trim()
            : '';
        items.push({
          id: String(user.id),
          label: name || email || String(user.id),
          email: email || null,
        });
      }
      if (batch.length < 100) break;
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return { items };
  }

  async fmsUsers(): Promise<{ items: DirectoryOption[] }> {
    if (!this.fms.enabled()) {
      throw new ServiceUnavailableException(
        'Ooredoo FMS is not enabled (set OOREDOO_FMS_ENABLED=true)',
      );
    }
    const assignees = await this.fms.listDirectoryAssignees();
    const items = assignees
      .map((row) => ({
        id: String(row.id),
        label: row.email?.trim() || `FMS user ${row.id}`,
        email: row.email?.trim() || null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { items };
  }
}
