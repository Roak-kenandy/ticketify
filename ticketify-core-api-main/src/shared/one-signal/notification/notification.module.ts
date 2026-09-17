// Package.
import { Global, Module } from '@nestjs/common';
// Internal.
import NotificationService from './notification.service';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';

// Code.
@Global()
@Module({
  imports: [LoggerModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
