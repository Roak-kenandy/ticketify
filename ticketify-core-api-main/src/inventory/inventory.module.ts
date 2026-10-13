import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CrmApiModule } from 'src/infrastructure/crm/crm-api.module';
import { InventoryController } from './inventory.controller';
import { InventoryItemsService } from './inventory-items.service';
import { InventoryReportService } from './inventory-report.service';
import { TicketInventoryService } from './ticket-inventory.service';
import { TicketSnapshotService } from './ticket-snapshot.service';

@Module({
  imports: [CrmApiModule, AuthModule],
  controllers: [InventoryController],
  providers: [
    InventoryItemsService,
    TicketInventoryService,
    InventoryReportService,
    TicketSnapshotService,
  ],
  exports: [TicketInventoryService, TicketSnapshotService],
})
export class InventoryModule {}
