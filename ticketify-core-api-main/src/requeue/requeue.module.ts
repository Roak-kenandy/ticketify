import { Module } from '@nestjs/common';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { RequeueSchedulerService } from './requeue-scheduler.service';
import { ServiceRequestRequeueService } from './service-request-requeue.service';

@Module({
  imports: [LoggerModule, PaymentsModule],
  providers: [ServiceRequestRequeueService, RequeueSchedulerService],
  exports: [ServiceRequestRequeueService],
})
export class RequeueModule {}
