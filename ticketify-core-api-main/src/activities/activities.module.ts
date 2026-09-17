import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';

@Global()
@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  imports: [ConfigModule, LoggerModule],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
