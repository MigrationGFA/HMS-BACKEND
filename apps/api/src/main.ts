import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  const corsOrigins = configService.get<string[] | true>('app.corsOrigins', true);
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

  const port = Number(process.env.PORT) || configService.get<number>('app.port', 3030);
  // Bind 0.0.0.0 so cloud hosts (Render, etc.) can detect the open port.
  await app.listen(port, '0.0.0.0');
}
bootstrap();
