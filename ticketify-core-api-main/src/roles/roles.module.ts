import { Module } from '@nestjs/common';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [LoggerModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
