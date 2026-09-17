// Package.
import { Global, Module } from '@nestjs/common';
// Internal.
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import SMSService from './sms.service';

// Code.
@Global()
@Module({
  imports: [LoggerModule],
  providers: [SMSService],
  exports: [SMSService],
})
export class SMSModule {}
