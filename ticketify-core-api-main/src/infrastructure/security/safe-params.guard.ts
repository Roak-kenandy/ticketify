import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

/** Ids, references and receipt numbers only ever use these characters. */
const SAFE_ID = /^[A-Za-z0-9._:@+-]{1,128}$/;
const ID_LIKE_QUERY = /^(state|reference|.*_id|.*Id)$/;

/**
 * Route params (and id-like query values) are pasted into CRM URLs by legacy
 * code. Express decodes them first, so `..%2F` or `%23` would let a caller
 * steer requests to arbitrary CRM paths with the company API key attached.
 * Reject anything that is not a plain identifier before it reaches a handler.
 */
@Injectable()
export class SafeParamsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    for (const value of Object.values(request.params ?? {})) {
      this.assertSafe(value);
    }
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (ID_LIKE_QUERY.test(key)) {
        this.assertSafe(value);
      }
    }
    return true;
  }

  private assertSafe(value: unknown) {
    if (value === undefined || value === '') {
      return;
    }
    if (
      typeof value !== 'string' ||
      !SAFE_ID.test(value) ||
      value.includes('..')
    ) {
      throw new BadRequestException('Invalid identifier');
    }
  }
}
