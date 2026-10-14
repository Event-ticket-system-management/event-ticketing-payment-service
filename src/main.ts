import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'nestjs-consumer-server',
        brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
        retry: {
          initialRetryTime: 300,
          retries: 10,
        },
      },
      consumer: {
        groupId: 'payment-service-group-server',
      },
    },
  });

  await app.startAllMicroservices();

  app.setGlobalPrefix('api/v1');
  const port = process.env.PORT || 8084;
  await app.listen(port);

  Logger.log(`Payment Service is running on port ${port}`, 'Bootstrap');
}
void bootstrap().catch((error: unknown) => {
  Logger.error(
    'Payment Service startup failed',
    error instanceof Error ? error.stack : String(error),
    'Bootstrap',
  );

  process.exitCode = 1;
});
