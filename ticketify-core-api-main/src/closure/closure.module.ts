import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ProvisioningModule } from 'src/provisioning/provisioning.module';
import { ClosureController } from './closure.controller';
import { ClosureValidationService } from './closure-validation.service';

@Module({
  imports: [AuthModule, InventoryModule, ProvisioningModule],
  controllers: [ClosureController],
  providers: [ClosureValidationService],
  exports: [ClosureValidationService],
})
export class ClosureModule {}
