import { Module } from '@nestjs/common';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { UserModule } from 'src/user/user.module';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [UserModule, LoggerModule],
  controllers: [TrackingController],
})
export class TrackingModule {}
