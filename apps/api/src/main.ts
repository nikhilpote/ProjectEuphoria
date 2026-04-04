import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RedisIoAdapter } from './adapters/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Serve uploaded video files as static assets at /uploads/*
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Use Winston for NestJS internal logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Warn clearly if critical secrets are missing (don't crash — let NestJS modules throw proper errors)
  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'REDIS_URL'];
  for (const key of requiredSecrets) {
    if (!configService.get<string>(key)) {
      console.warn(`[Bootstrap] WARNING: environment variable "${key}" is not set. The API may fail to start.`);
    }
  }

  // Security — relax CORP/COEP for cross-origin admin access in non-production
  app.use(helmet({
    crossOriginResourcePolicy: nodeEnv === 'production' ? { policy: 'same-origin' } : false,
    crossOriginOpenerPolicy: nodeEnv === 'production' ? { policy: 'same-origin' } : false,
  }));
  app.use(compression());

  // CORS — tighten origins in production
  app.enableCors({
    origin: nodeEnv === 'production' ? false : true,
    credentials: true,
  });

  // Health check — registered before global prefix so it lives at GET /health
  // Used by Docker, load balancers, and CI readiness checks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.getHttpAdapter().get('/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // WebSocket adapter (Socket.IO) — Redis adapter enables multi-instance pub/sub
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  app.useWebSocketAdapter(redisIoAdapter);

  // Swagger — dev/staging only
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Euphoria API')
      .setDescription('Euphoria live game show platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(`Euphoria API running on port ${port}`, 'Bootstrap');
  logger.log(`Environment: ${nodeEnv}`, 'Bootstrap');
}

void bootstrap();
