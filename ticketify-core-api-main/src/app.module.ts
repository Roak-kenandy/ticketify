import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { TicketsModule } from './tickets/tickets.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './infrastructure/config/prisma/prisma.module';
import { validateEnv } from './infrastructure/config/env.validation';
import { UserModule } from './user/user.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ReportsModule } from './reports/reports.module';
import { CrmApiModule } from './infrastructure/crm/crm-api.module';
import { IntegrationAuditModule } from './infrastructure/audit/integration-audit.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ChargesModule } from './charges/charges.module';
import { WorkflowConfigModule } from './config/workflow-config.module';
import { AssignmentModule } from './assignment/assignment.module';
import { PaymentsModule } from './payments/payments.module';
import { FinanceModule } from './finance/finance.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { SafeParamsGuard } from './infrastructure/security/safe-params.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 200 }],
    }),
    CrmApiModule,
    SecurityModule,
    IntegrationAuditModule,
    ChargesModule,
    WorkflowConfigModule,
    AssignmentModule,
    PaymentsModule,
    FinanceModule,
    DispatchModule,
    DashboardModule,
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
    {
      provide: APP_GUARD,
      useClass: SafeParamsGuard,
    },
  ],
})
export class AppModule {}
