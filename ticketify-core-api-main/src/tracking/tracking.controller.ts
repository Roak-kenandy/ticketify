import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { UserService } from 'src/user/user.service';
import { parseTraccarPayload } from './traccar-payload';

/**
 * Receives positions from Traccar Client on technicians' phones. There is no
 * JWT here: the per-technician device id is the credential, so unknown ids get
 * 404. Everything else answers 200, otherwise the client retries the point forever.
 */
@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly users: UserService,
    private readonly logger: LoggerService,
  ) {}

  // Many phones can share one carrier NAT address; each sends about one point a minute.
  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Post('traccar')
  @HttpCode(200)
  async traccar(@Query() query: unknown, @Body() body: unknown) {
    return this.ingest(query, body);
  }

  // An http:// server URL is 301-redirected to https, and the phone replays the POST as a GET
  // with the same query string; OsmAnd-style clients can also be set to send GET.
  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get('traccar')
  @HttpCode(200)
  async traccarGet(@Query() query: unknown) {
    return this.ingest(query, undefined);
  }

  private async ingest(query: unknown, body: unknown) {
    const parsed = parseTraccarPayload(query, body);
    if ('reason' in parsed) {
      this.logger.warn('Tracking', `Ignored Traccar post: ${parsed.reason}`);
      return { ok: true, ignored: parsed.reason };
    }

    let stored = 0;
    let ignored: string | undefined;
    for (const fix of parsed.fixes) {
      const result = await this.users.recordTrackerFix(fix.deviceId, fix);
      if (result === 'unknown_device') {
        throw new NotFoundException('Unknown device');
      }
      if (result === 'stored') {
        stored += 1;
      } else {
        ignored = result;
      }
    }
    return stored ? { ok: true } : { ok: true, ignored };
  }
}
