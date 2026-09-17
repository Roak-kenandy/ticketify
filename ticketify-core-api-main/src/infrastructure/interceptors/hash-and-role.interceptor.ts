import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs';
import { sanitize } from '../common/helpers/utils';

@Injectable()
export class HashAndRoleSanitizerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>) {
    return next.handle().pipe(tap((data) => sanitize(data, 'hash')));
  }
}
