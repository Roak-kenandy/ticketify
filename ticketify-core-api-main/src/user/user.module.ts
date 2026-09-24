import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminUsersController } from './admin-users.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';

@Module({
  controllers: [UserController, AdminUsersController],
  providers: [UserService],
  imports: [LoggerModule],
  exports: [UserService],
})
export class UserModule {}
