import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DummyIncaClient } from './dummy-inca.client';
import { INCA_CLIENT, IncaClient } from './inca.types';
import { UnconfiguredIncaClient } from './unconfigured-inca.client';

@Global()
@Module({
  providers: [
    {
      provide: INCA_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IncaClient => {
        const mode = String(config.get('INCA_MODE') ?? 'dummy')
          .trim()
          .toLowerCase();
        if (mode === 'dummy') {
          return new DummyIncaClient({
            latencyMs: Number(config.get('INCA_DUMMY_LATENCY_MS') ?? 700),
            offline:
              String(config.get('INCA_DUMMY_OFFLINE') ?? '').toLowerCase() ===
              'true',
          });
        }
        return new UnconfiguredIncaClient(mode);
      },
    },
  ],
  exports: [INCA_CLIENT],
})
export class IncaModule {}
