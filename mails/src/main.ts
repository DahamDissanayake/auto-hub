import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express');

async function bootstrap() {
  // Disable built-in body parser so we can raise the limit for
  // base64-encoded signature images (can be several MB per request).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));
  app.enableCors();
  await app.listen(3001);
}
bootstrap();
