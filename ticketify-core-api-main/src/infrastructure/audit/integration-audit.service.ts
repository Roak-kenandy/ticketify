import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

@Injectable()
export class IntegrationAuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: {
    entity_type: string;
    entity_id: string;
    action: string;
    actor_user_id?: string;
    old_state?: unknown;
    new_state?: unknown;
    crm_sync_ok?: boolean;
    error_message?: string;
    idempotency_key?: string;
  }) {
    try {
      await this.prisma.integrationAuditLog.create({
        data: {
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          action: entry.action,
          actor_user_id: entry.actor_user_id,
          old_state: entry.old_state as object,
          new_state: entry.new_state as object,
          crm_sync_ok: entry.crm_sync_ok,
          error_message: entry.error_message,
          idempotency_key: entry.idempotency_key,
        },
      });
    } catch {
      // Duplicate idempotency_key — treat as already logged
    }
  }
}
