import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentEngineService } from './assignment-engine.service';
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

  async tick() {
    if (this.running) {
      return;
    }

    const enabled = await this.settings.isAutoAssignEnabled();
    if (!enabled) {
      return;
    }

    this.running = true;
    try {
      const results = await this.engine.runAutoAssign({});
      await this.settings.recordLastRun(results);
      const assignedCount = results.reduce(
        (n, r) => n + r.assigned.length,
        0,
      );
      if (assignedCount > 0) {
        this.logger.log(`Auto-assign assigned ${assignedCount} ticket(s)`);
      }
    } catch (err) {
      this.logger.warn(`Auto-assign tick failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
