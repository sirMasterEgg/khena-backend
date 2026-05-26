import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { doubleCsrfProtection } from 'csrf-csrf';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Cookie parser middleware
  app.use(cookieParser());

  // CORS setup
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigin.split(',').map(o => o.trim()),
    credentials: true,
  });

  // CSRF protection
  const { doubleCsrfMiddleware } = doubleCsrfProtection({
    getSecret: () => 'your-secret-key', // TODO: load from env
  });
  app.use(doubleCsrfMiddleware);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get('Reflector')));

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
bootstrap();
