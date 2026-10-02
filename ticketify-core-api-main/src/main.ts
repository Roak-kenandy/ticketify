import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ReturnedExceptionInterceptor } from './infrastructure/common/interceptors/returned-exception.interceptor';

function parseCorsOrigins(raw: string | undefined): string[] | true {
  if (!raw?.trim()) {
    return true;
  }
  const origins = raw
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  return origins.length ? origins : true;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      skipMissingProperties: false,
    }),
  );

  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const corsOrigins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));

  app.enableCors({
    origin: nodeEnv === 'production' ? corsOrigins : corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  app.useGlobalInterceptors(
    new ReturnedExceptionInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.setGlobalPrefix('api/v1');
  await app.listen(config.get<number>('PORT') ?? 3333);
}
bootstrap();
