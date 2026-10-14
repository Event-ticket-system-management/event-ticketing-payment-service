import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentEventProducer implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(private readonly config: ConfigService) {
    const kafka = new Kafka({
      clientId: 'payment-service',
      brokers: this.config.getOrThrow<string>('KAFKA_BROKERS').split(','),
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async publisher(
    topic: string,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    console.log('Hello');
    await this.producer.send({
      topic,
      acks: -1,
      messages: [
        {
          key: String(payload.bookingId),
          value: JSON.stringify({
            eventId,
            eventType: topic,
            ...payload,
          }),
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }
}
