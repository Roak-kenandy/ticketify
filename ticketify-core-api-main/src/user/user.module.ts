import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminUsersController } from './admin-users.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { PresenceExpiryService } from './presence-expiry.service';

@Module({
  controllers: [UserController, AdminUsersController],
  providers: [UserService, PresenceExpiryService],
  imports: [LoggerModule],
  exports: [UserService],
})
export class UserModule {}
