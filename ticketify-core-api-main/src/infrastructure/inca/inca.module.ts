import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { LoggerModule } from '../logger/logger.module';
import { LoggerService } from '../logger/logger.service';
import { DummyIncaClient } from './dummy-inca.client';
import { INCA_CLIENT, IncaClient } from './inca.types';
import {
  createPinnedSender,
  IncaTransport,
  IncaTransportConfig,
} from './live/inca-transport';
import { LiveIncaClient } from './live/live-inca.client';
import { UnconfiguredIncaClient } from './unconfigured-inca.client';

function liveConfig(config: ConfigService): IncaTransportConfig {
  const value = (key: string) => String(config.get(key) ?? '').trim();
  let caPem: string;
  try {
    caPem = readFileSync(value('INCA_TLS_CA_FILE'), 'utf8');
  } catch {
    throw new Error('INCA_TLS_CA_FILE could not be read');
  }
  return {
    baseUrl: value('INCA_BASE_URL'),
    username: value('INCA_USERNAME'),
    // Passwords may legitimately start or end with spaces.
    password: String(config.get('INCA_PASSWORD') ?? ''),
    caPem,
    fingerprint256: value('INCA_TLS_FINGERPRINT'),
    timeoutMs: Number(config.get('INCA_TIMEOUT_MS') ?? 15000),
    maxConcurrent: Number(config.get('INCA_MAX_CONCURRENT') ?? 4),
  };
}

@Global()
@Module({
  imports: [LoggerModule],
  providers: [
    {
      provide: INCA_CLIENT,
      inject: [ConfigService, LoggerService],
      useFactory: (
        config: ConfigService,
        logger: LoggerService,
      ): IncaClient => {
        const mode = String(config.get('INCA_MODE') ?? 'dummy')
          .trim()
          .toLowerCase();
        logger.log(
          'INCA',
          mode === 'live'
            ? `Live INCA at ${String(config.get('INCA_BASE_URL') ?? '').trim()}`
            : `INCA_MODE=${mode}: provisioning does NOT reach the real INCA`,
        );
        if (mode === 'dummy') {
          return new DummyIncaClient({
            latencyMs: Number(config.get('INCA_DUMMY_LATENCY_MS') ?? 700),
            offline:
              String(config.get('INCA_DUMMY_OFFLINE') ?? '').toLowerCase() ===
              'true',
          });
        }
        if (mode === 'live') {
          const settings = liveConfig(config);
          return new LiveIncaClient(
            new IncaTransport(settings, createPinnedSender(settings), logger),
          );
        }
        return new UnconfiguredIncaClient(mode);
      },
    },
  ],
  exports: [INCA_CLIENT],
})
export class IncaModule {}
