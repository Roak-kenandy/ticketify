import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ReturnedExceptionInterceptor } from './infrastructure/common/interceptors/returned-exception.interceptor';
import { SafeExceptionFilter } from './infrastructure/common/filters/safe-exception.filter';
import { normalizeNodeEnv } from './infrastructure/config/env.validation';

function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Legacy code logs request bodies and CRM responses via console.*; keep that out of production logs. */
function silenceVerboseConsole() {
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

async function bootstrap() {
  process.env.NODE_ENV = normalizeNodeEnv(process.env.NODE_ENV);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const config = app.get(ConfigService);
  const nodeEnv = normalizeNodeEnv(config.get<string>('NODE_ENV'));
  const isProduction = nodeEnv === 'production';
  if (isProduction) {
    silenceVerboseConsole();
  }

  app.set('trust proxy', config.get<string>('TRUST_PROXY_HOPS') ?? 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      skipMissingProperties: false,
      disableErrorMessages: false,
    }),
  );

  const corsOrigins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));
  app.enableCors({
    // Mobile clients send no Origin header and are unaffected; browsers are limited to the admin panel.
    origin: isProduction
      ? corsOrigins
      : corsOrigins.length
        ? corsOrigins
        : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: false,
    maxAge: 600,
  });

  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalInterceptors(
    new ReturnedExceptionInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT') ?? 3333);
}
bootstrap();
