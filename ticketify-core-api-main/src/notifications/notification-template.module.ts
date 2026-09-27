import { Module } from '@nestjs/common';
import { NotificationTemplateService } from './notification-template.service';
import { PrismaModule } from 'src/infrastructure/config/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationTemplateService],
  exports: [NotificationTemplateService],
})
export class NotificationTemplateModule {}
