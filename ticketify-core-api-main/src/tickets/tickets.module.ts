import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { UserModule } from 'src/user/user.module';
import { SMSModule } from 'src/shared/ooredoo-sms/sms.module';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  imports: [LoggerModule, UserModule, SMSModule],
  exports: [TicketsService],
})
export class TicketsModule {}
