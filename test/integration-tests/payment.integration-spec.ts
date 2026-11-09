import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ProcessPaymentDto } from '../../src/modules/payment/dto/process-payment.dto';
import { PaymentController } from '../../src/modules/payment/payment.controller';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { ProcessedEventEntity } from '../../src/modules/payment/entities/process-event.entity';
import { OutboxPublisher } from '../../src/modules/payment/outbox/outbox.publisher';
import { OutboxEventEntity } from '../../src/modules/payment/entities/outbox-event.entity';
import { PaymentEntity } from '../../src/modules/payment/entities/payment.entity';
import { InitialPaymentSchema1791909622822 } from '../../src/database/migrations/1791909622822-InitialPaymentSchema';
import { PaymentEventProducer } from '../../src/modules/payment/kafka/payment-event.producer';
import { PaymentStatusEnum } from '../../src/modules/payment/enums/payment-status.enum';
import { OutboxStatusEnum } from '../../src/modules/payment/enums/outbox-status.enum';

const testIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const incoming: ProcessPaymentDto = {
  eventId: '48185ec2-93bb-4904-a7b8-fc55a5d998fa',
  bookingId: '7be8c4f1-037b-4b6f-9a5b-3b2dc5a288c2',
  userId: 'ecc0ca8d-871b-4ee3-94f4-acf9707d5046',
  totalPrice: 99.25,
  currency: 'USD',
  idempotencyKey: 'checkout-001',
};
const newId = (): string => randomUUID();

testIfDb(
  'PaymentController + PaymentService + OutboxPublisher (PostgreSQL integration)',
  () => {
    let db: DataSource;
    let module: TestingModule;
    let controller: PaymentController;
    let service: PaymentService;
    let outbox: OutboxPublisher;
    const publish = jest.fn<
      Promise<void>,
      [string, string, Record<string, unknown>]
    >();

    beforeAll(async () => {
      db = new DataSource({
        type: 'postgres',
        url: process.env.TEST_DATABASE_URL!,
        entities: [PaymentEntity, ProcessedEventEntity, OutboxEventEntity],
        migrations: [InitialPaymentSchema1791909622822],
        migrationsTableName: 'migrations',
        synchronize: false,
        logging: false,
      });
      await db.initialize();
      // The supplied migration uses uuid_generate_v4().
      await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await db.runMigrations();
      module = await Test.createTestingModule({
        controllers: [PaymentController],
        providers: [
          PaymentService,
          OutboxPublisher,
          { provide: DataSource, useValue: db },
          { provide: PaymentEventProducer, useValue: { publisher: publish } },
        ],
      }).compile();
      controller = module.get(PaymentController);
      service = module.get(PaymentService);
      outbox = module.get(OutboxPublisher);
    });

    beforeEach(async () => {
      jest.resetAllMocks();
      publish.mockResolvedValue(undefined);
      await db.query(
        'TRUNCATE TABLE outbox_events, processed_events, payments RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      if (module) await module.close();
      if (db?.isInitialized) await db.destroy();
    });

    it('persists payment, consumed event and outbox record in one committed transaction', async () => {
      await expect(controller.handleBookingCreated(incoming)).resolves.toEqual({
        message: 'Payment request accepted and processing initiated.',
      });
      const payment = await db
        .getRepository(PaymentEntity)
        .findOneByOrFail({ bookingId: incoming.bookingId });
      expect(payment.amount).toBe('99.25');
      expect(payment.status).toBe(PaymentStatusEnum.SUCCESS);
      expect(payment.failureReason).toBeNull();
      expect(await db.getRepository(ProcessedEventEntity).count()).toBe(1);
      const evt = await db
        .getRepository(OutboxEventEntity)
        .findOneByOrFail({ aggregateId: payment.id });
      expect(evt.type).toBe('payment.completed');
      expect(evt.status).toBe(OutboxStatusEnum.PENDING);
      expect(evt.retryCount).toBe(0);
      expect(evt.payload).toEqual(
        expect.objectContaining({
          bookingId: incoming.bookingId,
          status: PaymentStatusEnum.SUCCESS,
        }),
      );
    });

    it('ignores duplicate event ID without creating additional records', async () => {
      await service.processBookingPayment(incoming);
      await service.processBookingPayment(incoming);
      expect(await db.getRepository(PaymentEntity).count()).toBe(1);
      expect(await db.getRepository(OutboxEventEntity).count()).toBe(1);
      expect(await db.getRepository(ProcessedEventEntity).count()).toBe(1);
    });

    it('accepts different event ID for same booking only when payment details match', async () => {
      await service.processBookingPayment(incoming);
      await service.processBookingPayment({ ...incoming, eventId: newId() });
      expect(await db.getRepository(PaymentEntity).count()).toBe(1);
      expect(await db.getRepository(OutboxEventEntity).count()).toBe(1);
      expect(await db.getRepository(ProcessedEventEntity).count()).toBe(2);
    });

    it('rolls back processed-event insert on a conflicting payment request', async () => {
      await service.processBookingPayment(incoming);
      await expect(
        service.processBookingPayment({
          ...incoming,
          eventId: newId(),
          totalPrice: 199.25,
        }),
      ).rejects.toThrow('Conflicting payment request');
      expect(await db.getRepository(ProcessedEventEntity).count()).toBe(1);
      expect(await db.getRepository(PaymentEntity).count()).toBe(1);
      expect(await db.getRepository(OutboxEventEntity).count()).toBe(1);
    });

    it('rolls back entire transaction when outbox insertion fails', async () => {
      // Force a database-level CHECK constraint violation only during outbox creation.
      await db.query(
        "ALTER TABLE outbox_events ADD CONSTRAINT test_reject_pending CHECK (status <> 'PENDING')",
      );
      try {
        await expect(service.processBookingPayment(incoming)).rejects.toThrow();
        expect(await db.getRepository(PaymentEntity).count()).toBe(0);
        expect(await db.getRepository(ProcessedEventEntity).count()).toBe(0);
        expect(await db.getRepository(OutboxEventEntity).count()).toBe(0);
      } finally {
        await db.query(
          'ALTER TABLE outbox_events DROP CONSTRAINT test_reject_pending',
        );
      }
    });

    it('publishes pending event and marks it PROCESSED in PostgreSQL', async () => {
      await service.processBookingPayment(incoming);
      await outbox.publishPendingEvents();
      const evt = await db
        .getRepository(OutboxEventEntity)
        .findOneByOrFail({ type: 'payment.completed' });
      expect(publish).toHaveBeenCalledWith(evt.type, evt.id, evt.payload);
      expect(evt.status).toBe(OutboxStatusEnum.PROCESSED);
      expect(evt.processedAt).toBeInstanceOf(Date);
      expect(evt.retryCount).toBe(0);
    });

    it('retains pending events when Kafka mock rejects, then succeeds on retry', async () => {
      await service.processBookingPayment(incoming);
      publish.mockRejectedValueOnce(new Error('Kafka offline'));
      await outbox.publishPendingEvents();
      let evt = await db
        .getRepository(OutboxEventEntity)
        .findOneByOrFail({ type: 'payment.completed' });
      expect(evt.status).toBe(OutboxStatusEnum.PENDING);
      expect(evt.retryCount).toBe(1);
      await outbox.publishPendingEvents();
      evt = await db
        .getRepository(OutboxEventEntity)
        .findOneByOrFail({ id: evt.id });
      expect(evt.status).toBe(OutboxStatusEnum.PROCESSED);
      expect(evt.retryCount).toBe(1);
    });

    it('marks repeatedly undeliverable event FAILED after five retries', async () => {
      await service.processBookingPayment(incoming);
      publish.mockRejectedValue(new Error('Kafka offline'));
      for (let i = 0; i < 5; i++) await outbox.publishPendingEvents();
      const evt = await db
        .getRepository(OutboxEventEntity)
        .findOneByOrFail({ type: 'payment.completed' });
      expect(evt.retryCount).toBe(5);
      expect(evt.status).toBe(OutboxStatusEnum.FAILED);
    });

    it('handles multiple distinct booking requests with separate outbox messages', async () => {
      await service.processBookingPayment(incoming);
      await service.processBookingPayment({
        ...incoming,
        eventId: newId(),
        bookingId: newId(),
        idempotencyKey: 'checkout-002',
      });
      expect(await db.getRepository(PaymentEntity).count()).toBe(2);
      await outbox.publishPendingEvents();
      expect(publish).toHaveBeenCalledTimes(2);
      expect(
        await db
          .getRepository(OutboxEventEntity)
          .countBy({ status: OutboxStatusEnum.PROCESSED }),
      ).toBe(2);
    });
  },
);
