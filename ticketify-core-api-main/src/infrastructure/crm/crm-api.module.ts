import { Global, Module } from '@nestjs/common';
import { CrmApiClient } from './crm-api.client';
import { LoggerModule } from '../logger/logger.module';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [CrmApiClient],
  exports: [CrmApiClient],
})
export class CrmApiModule {}
