import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { AppModule } from './app.module';

function ensureDbDirectory() {
  const dbPath = process.env.DATABASE_PATH ?? 'data/timeoff.sqlite';
  if (dbPath === ':memory:') {
    return;
  }
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function bootstrap() {
  ensureDbDirectory();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
