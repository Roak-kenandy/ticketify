import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { TechnicianPresence } from '@prisma/client';

@Injectable()
export class PresenceExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceExpiryService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.releaseExpiredBusy(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async releaseExpiredBusy() {
    const now = new Date();
    const result = await this.prisma.user.updateMany({
      where: {
        presence: TechnicianPresence.BUSY,
        busy_until: { lte: now },
      },
      data: {
        presence: TechnicianPresence.ONLINE,
        availability: true,
        busy_comment: null,
        busy_until: null,
      },
    });
    if (result.count > 0) {
      this.logger.log(`Released ${result.count} technician(s) from BUSY → ONLINE`);
    }
  }
}
