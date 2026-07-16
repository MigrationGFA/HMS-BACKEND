import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
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
      Number(process.env.PORT) || configService.get<number>('app.port', 3030);

    // Bind to 0.0.0.0 so Azure App Service's reverse proxy can reach the container
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    console.error('Bootstrap failed:', error);
    throw error;
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
