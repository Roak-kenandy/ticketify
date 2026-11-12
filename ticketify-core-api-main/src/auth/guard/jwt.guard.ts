import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Access, meetsAny } from '../access/access';

/**
 * Authenticates the bearer token and also enforces any `@Access(...)` on the
 * route, so a permission check can never be silently skipped by forgetting a
 * second guard. Routes without `@Access` are open to any signed-in user.
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
    const requirements = this.reflector.getAllAndOverride(Access, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requirements?.length) {
      const user = context.switchToHttp().getRequest().user;
      if (!meetsAny(user?.access, requirements)) {
        throw new ForbiddenException('You do not have access to this action');
      }
    }
    return true;
  }
}
