import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { hasAnyRole } from '../ops-roles';

/**
 * Authenticates the bearer token and also enforces any `@Roles(...)` on the
 * route, so a role restriction can never be silently skipped by forgetting
 * to add RolesGuard.
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) {
      return false;
    }
    const roles = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length) {
      const user = context.switchToHttp().getRequest().user;
      if (!hasAnyRole(roles, user?.role)) {
        throw new ForbiddenException('You do not have access to this action');
      }
    }
    return true;
  }
}
