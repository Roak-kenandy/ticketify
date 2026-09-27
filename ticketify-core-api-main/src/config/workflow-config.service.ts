import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export type LmWorkflowConfig = {
  activityTypeId: string;
  activityTypeName: string;
  transportTeamId: string;
  transportTeamName: string;
};

@Injectable()
export class WorkflowConfigService {
  constructor(private config: ConfigService) {}

  getLmConfig(): LmWorkflowConfig {
    const fromFile = this.readMappingFile();
    const lm = fromFile?.departments?.TRANSPORT_LM;
    const access = fromFile?.departments?.ACCESS;

    return {
      activityTypeId:
        this.config.get('LM_ACTIVITY_TYPE_ID') ??
        lm?.activity_type_id ??
        '57fe0cf0-5b86-4561-8ccb-ceeb3fbef462',
      activityTypeName: 'Last Mile Cabling',
      transportTeamId:
        this.config.get('LM_TRANSPORT_TEAM_ID') ??
        access?.lm_handoff_team_id ??
        lm?.transport_team_id ??
        'aac0b9c0-fc77-45c3-8cac-b458eedc613a',
      transportTeamName: 'Transport Network',
    };
  }

  getCompleteStageIdForQueue(queueId: string | undefined | null): string | null {
    if (!queueId) return null;
    const fromFile = this.readMappingFile();
    const workflows = fromFile?.departments?.ACCESS?.workflows ?? {};
    for (const key of Object.keys(workflows)) {
      const wf = workflows[key];
      if (wf?.queue_id === queueId && wf?.complete_stage_id) {
        return wf.complete_stage_id;
      }
    }
    return null;
  }

  getStartStageIdForQueue(queueId: string | undefined | null): string | null {
    if (!queueId) return null;
    const fromFile = this.readMappingFile();
    const workflows = fromFile?.departments?.ACCESS?.workflows ?? {};
    for (const key of Object.keys(workflows)) {
      const wf = workflows[key];
      if (wf?.queue_id === queueId && wf?.start_stage_id) {
        return wf.start_stage_id;
      }
    }
    return null;
  }

  getNoResponseActivityTypeId(): string {
    const fromFile = this.readMappingFile();
    const id =
      this.config.get('NO_RESPONSE_ACTIVITY_TYPE_ID') ??
      fromFile?.ticketify_state_to_crm?.NO_RESPONSE?.activity_type_id;
    return id ?? 'e398310c-59f6-4dab-b5da-bb21ce401e7f';
  }

  listAccessQueueIds(): string[] {
    const fromFile = this.readMappingFile();
    const workflows = fromFile?.departments?.ACCESS?.workflows ?? {};
    return Object.values(workflows)
      .map((wf: { queue_id?: string }) => wf?.queue_id)
      .filter((id): id is string => Boolean(id));
  }

  private readMappingFile(): Record<string, any> | null {
    const candidates = [
      path.join(process.cwd(), 'config', 'workflow-mapping.json'),
      path.join(process.cwd(), 'config', 'workflow-mapping.example.json'),
    ];
    for (const filePath of candidates) {
      try {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch {
        // try next
      }
    }
    return null;
  }
}
