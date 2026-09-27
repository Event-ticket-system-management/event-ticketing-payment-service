import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const port = process.env.PORT || 8084;
  Logger.log(`Payment Service is running on port ${port}`, 'Bootstrap');
}
bootstrap();
