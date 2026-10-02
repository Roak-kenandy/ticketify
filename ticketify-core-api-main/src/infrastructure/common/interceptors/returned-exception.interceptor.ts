import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Many legacy service methods `return new XException()` instead of throwing it,
 * and internal callers (assignment engine, dispatch) rely on that return value.
 * At the HTTP boundary such a value must become a real error status, otherwise
 * clients receive a 200 and report success for a failed CRM step.
 */
@Injectable()
export class ReturnedExceptionInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map(value => {
        if (value instanceof HttpException) {
          throw value;
        }
        return value;
      }),
    );
  }
}
