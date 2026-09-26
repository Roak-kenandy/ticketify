import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { TicketsModule } from './tickets/tickets.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './infrastructure/config/prisma/prisma.module';
import { UserModule } from './user/user.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ReportsModule } from './reports/reports.module';
import { CrmApiModule } from './infrastructure/crm/crm-api.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 200 }],
    }),
    CrmApiModule,
    AuthModule,
    ActivitiesModule,
    TicketsModule,
    PrismaModule,
    UserModule,
    NotificationsModule,
    FeedbackModule,
    ReportsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
