import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [AuthModule, LoggerModule, InventoryModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
