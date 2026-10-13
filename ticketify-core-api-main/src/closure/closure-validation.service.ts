import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import {
  TICKET_CLOSED_ACTION,
  TicketInventoryService,
} from 'src/inventory/ticket-inventory.service';
import { TicketSnapshotService } from 'src/inventory/ticket-snapshot.service';
import {
  ProvisioningService,
  STATUS_LABELS,
} from 'src/provisioning/provisioning.service';
import { ACTION_LABELS } from 'src/provisioning/provisioning-policy';

export type ClosureCheck = {
  key: string;
  label: string;
  ok: boolean;
  /** `warn` checks are shown to the technician but never block closure. */
  severity: 'block' | 'warn';
  message: string | null;
  /** What the app should open to fix it. */
  action: 'inventory' | 'provisioning' | null;
};

export type ClosureEvaluation = {
  crm_ticket_id: string;
  enforced: boolean;
  ready: boolean;
  checks: ClosureCheck[];
};

/**
 * Phase 2 pre-close rules (inventory declaration, provisioning, signal and
 * ONT serial linkage). Billing, Last Mile and no-response rules are enforced
 * by their own services before this runs.
 */
@Injectable()
export class ClosureValidationService {
  constructor(
    private readonly inventory: TicketInventoryService,
    private readonly provisioning: ProvisioningService,
    private readonly snapshots: TicketSnapshotService,
    private readonly audit: IntegrationAuditService,
    private readonly config: ConfigService,
  ) {}

  enforced(): boolean {
    return (
      String(this.config.get('PHASE2_CLOSURE_ENFORCED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false'
    );
  }

  async evaluate(crmTicketId: string): Promise<ClosureEvaluation> {
    const snapshot = await this.snapshots.get(crmTicketId);
    const [stock, prov] = await Promise.all([
      this.inventory.closureState(crmTicketId),
      this.provisioning.closureState(crmTicketId, snapshot),
    ]);
    const checks: ClosureCheck[] = [];

    if (prov.required) {
      const label = `${ACTION_LABELS[prov.required.action]} provisioning`;
      const { status, error } = prov.required;
      let message: string | null = null;
      if (!status)
        message = `Run ${ACTION_LABELS[prov.required.action].toLowerCase()} provisioning in INCA.`;
      else if (status === 'FAILED' && error?.startsWith('INCA unavailable'))
        message =
          'Pending provisioning: INCA integration error. Retry when INCA is back.';
      else if (status === 'FAILED')
        message = `Provisioning failed: ${error ?? 'unknown reason'}. Retry it.`;
      else if (status !== 'SUCCEEDED')
        message = `Provisioning is still running (${STATUS_LABELS[status]}).`;
      checks.push({
        key: 'provisioning',
        label,
        ok: status === 'SUCCEEDED',
        severity: 'block',
        message,
        action: 'provisioning',
      });
    }

    if (prov.in_flight.length) {
      checks.push({
        key: 'provisioning_running',
        label: 'No provisioning running',
        ok: false,
        severity: 'block',
        message: `Wait for ${prov.in_flight.map((action) => ACTION_LABELS[action].toLowerCase()).join(', ')} to finish.`,
        action: 'provisioning',
      });
    }

    for (const action of prov.failed_optional) {
      checks.push({
        key: `provisioning_failed_${action.toLowerCase()}`,
        label: `${ACTION_LABELS[action]} result`,
        ok: false,
        severity: 'warn',
        message: `The last ${ACTION_LABELS[action].toLowerCase()} failed. Retry it if the customer's service depends on it.`,
        action: 'provisioning',
      });
    }

    if (prov.signal.required) {
      checks.push({
        key: 'signal',
        label: 'Signal check recorded',
        ok: prov.signal.captured,
        severity: 'block',
        message: prov.signal.captured
          ? null
          : 'Run a signal check and record the reading.',
        action: 'provisioning',
      });
    }

    const declared = stock.declaration;
    checks.push({
      key: 'inventory_declaration',
      label: 'Inventory declared',
      ok:
        Boolean(declared) &&
        (declared === 'NONE_USED' || stock.posted.length > 0),
      severity: 'block',
      message: !declared
        ? 'Record the items used, or confirm that no inventory was used.'
        : declared === 'USED' && !stock.posted.length
          ? 'All item lines were reversed. Add the items used, or declare no inventory used.'
          : null,
      action: 'inventory',
    });

    if (prov.installed_serials.length) {
      const posted = new Set(
        stock.posted
          .filter(
            (line) =>
              line.serialized && line.serial_number && line.quantity === 1,
          )
          .map((line) => line.serial_number as string),
      );
      const missing = prov.installed_serials.filter(
        (serial) => !posted.has(serial),
      );
      checks.push({
        key: 'ont_inventory',
        label: 'Installed ONT recorded in inventory',
        ok: missing.length === 0,
        severity: 'block',
        message: missing.length
          ? `Post ONT ${missing.join(', ')} as an inventory line (quantity 1).`
          : null,
        action: 'inventory',
      });
    }

    return {
      crm_ticket_id: crmTicketId,
      enforced: this.enforced(),
      ready: checks.every((check) => check.ok || check.severity === 'warn'),
      checks,
    };
  }

  async assertReadyToClose(
    crmTicketId: string,
  ): Promise<ClosureEvaluation | null> {
    if (!this.enforced()) {
      return null;
    }
    const evaluation = await this.evaluate(crmTicketId);
    if (!evaluation.ready) {
      const reasons = evaluation.checks
        .filter((check) => !check.ok && check.severity === 'block')
        .map((check) => check.message ?? check.label);
      throw new ForbiddenException(`Cannot close yet: ${reasons.join(' ')}`);
    }
    return evaluation;
  }

  /** TicketClosureValidation snapshot; also locks technician edits to inventory. */
  async recordClosure(
    crmTicketId: string,
    actorUserId: string | undefined,
    evaluation: ClosureEvaluation | null,
  ) {
    await this.audit.log({
      entity_type: 'ticket',
      entity_id: crmTicketId,
      action: TICKET_CLOSED_ACTION,
      actor_user_id: actorUserId,
      new_state: evaluation ?? { enforced: false },
      crm_sync_ok: true,
    });
  }
}
