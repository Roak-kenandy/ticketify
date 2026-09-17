import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CHECK_ABILITY } from 'src/infrastructure/decorators';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();

    const user = request.user;

    return matchRoles(roles, user.role);
  }
}
function matchRoles(roles: string[], roles1: any): boolean {
  return roles.some((role) => roles1?.includes(role));
}
