import { ConfigService } from '@nestjs/config';
import { PaymentEventProducer } from '../../src/modules/payment/kafka/payment-event.producer';

const connect = jest.fn();
const disconnect = jest.fn();
const send = jest.fn();

const producer = jest.fn<
  {
    connect: typeof connect;
    disconnect: typeof disconnect;
    send: typeof send;
  },
  [config: unknown]
>(() => ({
  connect,
  disconnect,
  send,
}));

const kafkaConstructor = jest.fn();

jest.mock('kafkajs', () => ({
  Kafka: class {
    constructor(config: unknown) {
      kafkaConstructor(config);
    }

    producer(config: unknown) {
      return producer(config);
    }
  },
}));

describe('PaymentEventProducer (unit)', () => {
  let service: PaymentEventProducer;

  beforeEach(() => {
    jest.clearAllMocks();

    connect.mockResolvedValue(undefined);
    disconnect.mockResolvedValue(undefined);
    send.mockResolvedValue(undefined);

    service = new PaymentEventProducer({
      getOrThrow: jest.fn(() => 'broker1:9092,broker2:9092'),
    } as unknown as ConfigService);
  });

  it('configures brokers, client id and prevents automatic topic creation', () => {
    expect(kafkaConstructor).toHaveBeenCalledWith({
      clientId: 'payment-service',
      brokers: ['broker1:9092', 'broker2:9092'],
    });

    expect(producer).toHaveBeenCalledWith({
      allowAutoTopicCreation: false,
    });
  });

  it('connects and disconnects Kafka producer through lifecycle hooks', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('sends keyed, serialized event with all replicas acknowledged', async () => {
    const payload = {
      bookingId: 'booking-1',
      paymentId: 'payment-1',
      status: 'SUCCESS',
    };

    await service.publisher('payment.completed', 'event-1', payload);

    expect(send).toHaveBeenCalledWith({
      topic: 'payment.completed',
      acks: -1,
      messages: [
        {
          key: 'booking-1',
          value: JSON.stringify({
            eventId: 'event-1',
            eventType: 'payment.completed',
            ...payload,
          }),
        },
      ],
    });
  });

  it('propagates Kafka send errors', async () => {
    send.mockRejectedValueOnce(new Error('broker timeout'));

    await expect(
      service.publisher('payment.failed', 'event-2', {
        bookingId: 'booking-2',
      }),
    ).rejects.toThrow('broker timeout');
  });
});
