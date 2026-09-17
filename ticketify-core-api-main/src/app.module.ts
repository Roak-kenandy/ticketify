import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { TicketsModule } from './tickets/tickets.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './infrastructure/config/prisma/prisma.module';
import { UserModule } from './user/user.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  providers: [],
})
export class AppModule {}
