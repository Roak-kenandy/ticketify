import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminDirectoryController } from './admin-directory.controller';
import { AdminDirectoryService } from './admin-directory.service';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { PresenceExpiryService } from './presence-expiry.service';
import { CrmApiModule } from 'src/infrastructure/crm/crm-api.module';
import { OoredooFmsModule } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.module';

@Module({
  controllers: [UserController, AdminUsersController, AdminDirectoryController],
  providers: [UserService, PresenceExpiryService, AdminDirectoryService],
  imports: [LoggerModule, CrmApiModule, OoredooFmsModule],
  exports: [UserService],
})
export class UserModule {}
