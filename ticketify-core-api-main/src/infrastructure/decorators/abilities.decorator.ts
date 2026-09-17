import { SetMetadata } from '@nestjs/common';

export const CHECK_ABILITY = 'checkAbility';

export interface requiredRule {
  action: string;
  subject: string;
  conditions?: any;
}

export const checkAbilities = (...requirments: requiredRule[]) =>
  SetMetadata(CHECK_ABILITY, requirments);
