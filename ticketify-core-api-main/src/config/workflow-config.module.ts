import { Global, Module } from '@nestjs/common';
import { WorkflowConfigService } from './workflow-config.service';

@Global()
@Module({
  providers: [WorkflowConfigService],
  exports: [WorkflowConfigService],
})
export class WorkflowConfigModule {}
