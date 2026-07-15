import fs from 'node:fs';
import path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
async function bootstrap() {
  // #region agent log
  const distMain = path.join(process.cwd(), 'dist', 'apps', 'api', 'main.js');
  fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '3bbec7',
    },
    body: JSON.stringify({
      sessionId: '3bbec7',
      location: 'main.ts:bootstrap-entry',
      message: 'bootstrap started',
      data: {
        argv: process.argv,
        npmLifecycleEvent: process.env.npm_lifecycle_event ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
        port: process.env.PORT ?? null,
        distMainExists: fs.existsSync(distMain),
        cwd: process.cwd(),
        websiteInstanceId: process.env.WEBSITE_INSTANCE_ID ?? null,
      },
      timestamp: Date.now(),
      hypothesisId: 'A',
      runId: 'pre-fix',
    }),
  }).catch(() => {});
  // #endregion
  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);
    app.use(helmet());
    const corsOrigins = configService.get<string[] | true>(
      'app.corsOrigins',
      true,
    );
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });
    app.setGlobalPrefix(configService.get<string>('app.apiPrefix', 'api'));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const port =
      Number(process.env.PORT) ||
      configService.get<number>('app.port', 3030);
    // #region agent log
    fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3bbec7',
      },
      body: JSON.stringify({
        sessionId: '3bbec7',
        location: 'main.ts:before-listen',
        message: 'about to listen',
        data: { port, host: '0.0.0.0' },
        timestamp: Date.now(),
        hypothesisId: 'E',
        runId: 'pre-fix',
      }),
    }).catch(() => {});
    // #endregion
    await app.listen(port, '0.0.0.0');
    // #region agent log
    fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3bbec7',
      },
      body: JSON.stringify({
        sessionId: '3bbec7',
        location: 'main.ts:listen-success',
        message: 'server listening',
        data: { port },
        timestamp: Date.now(),
        hypothesisId: 'E',
        runId: 'pre-fix',
      }),
    }).catch(() => {});
    // #endregion
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7838/ingest/28f02dd0-c205-4f8f-a1c9-0459405a272e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '3bbec7',
      },
      body: JSON.stringify({
        sessionId: '3bbec7',
        location: 'main.ts:bootstrap-error',
        message: 'bootstrap failed',
        data: {
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          stack:
            error instanceof Error ? error.stack?.split('\n').slice(0, 5) : [],
        },
        timestamp: Date.now(),
        hypothesisId: 'B',
        runId: 'pre-fix',
      }),
    }).catch(() => {});
    // #endregion
    throw error;
  }
}
bootstrap();
