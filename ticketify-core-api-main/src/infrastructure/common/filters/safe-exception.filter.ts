import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const URL_PATTERN = /https?:\/\/[^\s"']+/gi;
const MAX_MESSAGE_LENGTH = 500;

function scrub(message: string): string {
  return message
    .replace(URL_PATTERN, '[redacted-url]')
    .slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * Client-facing errors never include upstream (CRM / BML / SMS) bodies, URLs or
 * stack traces. 4xx messages are kept (they explain what the caller did wrong)
 * but scrubbed; 5xx become a generic message and the detail goes to the log.
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? exception.stack ?? exception.message
          : String(exception);
      this.logger.error(
        `${req.method} ${req.path} -> ${status}: ${scrub(detail)}`,
      );
      res.status(status).json({
        statusCode: status,
        message:
          status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'Service temporarily unavailable. Please try again.'
            : 'Something went wrong. Please try again.',
      });
      return;
    }

    const body = (exception as HttpException).getResponse();
    let message: string | string[] = (exception as HttpException).message;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      message = (body as { message: string | string[] }).message;
    } else if (typeof body === 'string') {
      message = body;
    }
    res.status(status).json({
      statusCode: status,
      message: Array.isArray(message)
        ? message.map((m) => scrub(String(m)))
        : scrub(String(message)),
    });
  }
}
