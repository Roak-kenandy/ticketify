import { Global, Module } from '@nestjs/common';
import { IntegrationAuditService } from './integration-audit.service';
import { PrismaModule } from '../config/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [IntegrationAuditService],
  exports: [IntegrationAuditService],
})
export class IntegrationAuditModule {}
