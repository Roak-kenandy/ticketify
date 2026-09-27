import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserModule } from 'src/user/user.module';
import { AssignmentModule } from 'src/assignment/assignment.module';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/infrastructure/config/prisma/prisma.module';

@Module({
  imports: [TicketsModule, UserModule, AssignmentModule, AuthModule, PrismaModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
