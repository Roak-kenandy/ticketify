import { Global, Module } from '@nestjs/common';
import NotificationService from './notification.service';
import { PushNotifierService } from './push-notifier.service';

@Global()
@Module({
  providers: [NotificationService, PushNotifierService],
  exports: [NotificationService, PushNotifierService],
})
export class NotificationModule {}
