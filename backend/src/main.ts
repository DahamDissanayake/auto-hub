import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Trust the nginx reverse proxy so req.ip reflects the real client IP
  // rather than the Docker bridge address, enabling per-client rate limiting.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 4000);
  console.log(`AutoHub backend running on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
