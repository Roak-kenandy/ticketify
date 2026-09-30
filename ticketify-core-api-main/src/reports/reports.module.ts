import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { FinanceReportService } from './finance-report.service';
import { MasterReportService } from './master-report.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, FinanceReportService, MasterReportService],
})
export class ReportsModule {}
