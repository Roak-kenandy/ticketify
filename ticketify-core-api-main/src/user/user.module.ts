import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [LoggerModule],
  exports: [UserService],
})
export class UserModule {}
