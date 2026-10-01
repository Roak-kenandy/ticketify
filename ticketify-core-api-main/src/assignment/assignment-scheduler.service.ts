import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssignmentEngineService,
  type AutoAssignResult,
} from './assignment-engine.service';
import { AssignmentSettingsService } from './assignment-settings.service';

@Injectable()
export class AssignmentSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssignmentSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private config: ConfigService,
    private settings: AssignmentSettingsService,
    private engine: AssignmentEngineService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(
      this.config.get('AUTO_ASSIGN_POLL_INTERVAL_MS') ?? 60_000,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.logger.log(
      `Auto-assign scheduler active (every ${intervalMs}ms; runs only when enabled)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Kick off a run without making the caller wait on CRM round-trips. */
  runSoon(actorUserId?: string) {
    void this.tick(actorUserId);
  }

  async tick(actorUserId?: string) {
    try {
      const results = await this.runExclusive({ actor_user_id: actorUserId });
      const assignedCount = (results ?? []).reduce(
        (n, r) => n + r.assigned.length,
        0,
      );
      if (assignedCount > 0) {
        this.logger.log(`Auto-assign assigned ${assignedCount} ticket(s)`);
      }
    } catch (err) {
      this.logger.warn(`Auto-assign tick failed: ${String(err)}`);
    }
  }

  /**
   * One run at a time, so overlapping runs can't hand the same ticket to two technicians.
   * Resolves to null when a run is already in progress or auto-assign is off.
   */
  async runExclusive(
    options: Parameters<AssignmentEngineService['runAutoAssign']>[0],
  ): Promise<AutoAssignResult[] | null> {
    if (this.running) {
      return null;
    }
    this.running = true;
    try {
      if (!(await this.settings.isAutoAssignEnabled())) {
        return null;
      }
      return await this.engine.runAutoAssign(options);
    } finally {
      this.running = false;
    }
  }
}
