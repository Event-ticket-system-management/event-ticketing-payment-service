import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { ProcessPaymentDto } from '../../src/modules/payment/dto/process-payment.dto';
import { PaymentEntity } from '../../src/modules/payment/entities/payment.entity';
import { ProcessedEventEntity } from '../../src/modules/payment/entities/process-event.entity';
import { OutboxEventEntity } from '../../src/modules/payment/entities/outbox-event.entity';
import { PaymentStatusEnum } from '../../src/modules/payment/enums/payment-status.enum';
import { OutboxStatusEnum } from '../../src/modules/payment/enums/outbox-status.enum';

const payload: ProcessPaymentDto = {
  eventId: 'a6f9da14-3886-4df2-8e19-4e49a14061e2',
  bookingId: 'b3b368ea-b65f-4d9c-a484-2dfdebb46c49',
  userId: '0a4af7c2-11dc-4a0b-a5d0-5b6b5c80e4e1',
  totalPrice: 200.25,
  currency: 'USD',
  idempotencyKey: 'idempotency-001',
};

describe('PaymentService (unit)', () => {
  let service: PaymentService;
  const execute = jest.fn();
  const findOne = jest.fn();
  const create = jest.fn((_entity: unknown, values: unknown) => values);
  const save = jest.fn(<T extends object>(entity: T): T & { id: string } => ({
    id: 'c7b5d074-b5c5-48e0-82ee-4028ed1a4b99',
    ...entity,
  }));
  const returning = jest.fn();
  const orIgnore = jest.fn();
  const values = jest.fn();
  const into = jest.fn();
  const insert = jest.fn();
  const createQueryBuilder = jest.fn();
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: { createQueryBuilder, findOne, create, save },
  };
  const source = { createQueryRunner: jest.fn(() => runner) };

  beforeEach(async () => {
    jest.resetAllMocks();
    runner.isTransactionActive = true;
    runner.connect.mockResolvedValue(undefined);
    runner.startTransaction.mockResolvedValue(undefined);
    runner.commitTransaction.mockResolvedValue(undefined);
    runner.rollbackTransaction.mockResolvedValue(undefined);
    runner.release.mockResolvedValue(undefined);
    execute.mockResolvedValue({ raw: [{ event_id: payload.eventId }] });
    returning.mockReturnValue({ execute });
    orIgnore.mockReturnValue({ returning });
    values.mockReturnValue({ orIgnore });
    into.mockReturnValue({ values });
    insert.mockReturnValue({ into });
    createQueryBuilder.mockReturnValue({ insert });
    findOne.mockResolvedValue(null);
    create.mockImplementation((_entity: unknown, data: unknown) => data);
    save.mockImplementation(
      (entity: Record<string, unknown>): Record<string, unknown> => ({
        id: 'c7b5d074-b5c5-48e0-82ee-4028ed1a4b99',
        ...entity,
      }),
    );
    source.createQueryRunner.mockReturnValue(runner);
    const module = await Test.createTestingModule({
      providers: [PaymentService, { provide: DataSource, useValue: source }],
    }).compile();
    service = module.get(PaymentService);
  });

  it('commits a successful payment and matching pending outbox event atomically', async () => {
    await service.processBookingPayment(payload);
    expect(runner.connect).toHaveBeenCalledTimes(1);
    expect(runner.startTransaction).toHaveBeenCalledTimes(1);
    expect(into).toHaveBeenCalledWith(ProcessedEventEntity);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: payload.eventId }),
    );
    expect(orIgnore).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith(PaymentEntity, {
      where: { bookingId: payload.bookingId },
    });
    expect(create).toHaveBeenCalledWith(
      PaymentEntity,
      expect.objectContaining({
        bookingId: payload.bookingId,
        amount: '200.25',
        status: PaymentStatusEnum.SUCCESS,
        failureReason: null,
        idempotencyKey: payload.idempotencyKey,
      }),
    );
    const createCalls: unknown = create.mock.calls;

    expect(createCalls).toMatchObject([
      [PaymentEntity, {}],
      [
        OutboxEventEntity,
        {
          type: 'payment.completed',
          status: OutboxStatusEnum.PENDING,
          retryCount: 0,
          payload: {
            bookingId: payload.bookingId,
            amount: '200.25',
          },
        },
      ],
    ]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('skips an already-processed event without inserting payment/outbox', async () => {
    execute.mockResolvedValueOnce({ raw: [] });
    await service.processBookingPayment(payload);
    expect(findOne).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('skips existing matching payment for a different event id', async () => {
    findOne.mockResolvedValueOnce({
      bookingId: payload.bookingId,
      userId: payload.userId,
      idempotencyKey: payload.idempotencyKey,
      amount: '200.25',
      currency: 'USD',
    });
    await service.processBookingPayment(payload);
    expect(save).not.toHaveBeenCalled();
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['different user', { userId: 'another-user' }],
    ['different key', { idempotencyKey: 'different' }],
    ['different amount', { amount: '999.00' }],
    ['different currency', { currency: 'EUR' }],
  ])('rejects a conflicting existing payment: %s', async (_name, change) => {
    findOne.mockResolvedValueOnce({
      bookingId: payload.bookingId,
      userId: payload.userId,
      idempotencyKey: payload.idempotencyKey,
      amount: '200.25',
      currency: 'USD',
      ...change,
    });
    await expect(service.processBookingPayment(payload)).rejects.toThrow(
      'Conflicting payment request',
    );
    expect(save).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('records a failed payment and payment.failed outbox when amount is zero (direct method call)', async () => {
    // The DTO rejects zero, but the service currently accepts it if invoked without validation.
    await service.processBookingPayment({ ...payload, totalPrice: 0 });
    expect(create).toHaveBeenCalledWith(
      PaymentEntity,
      expect.objectContaining({
        amount: '0.00',
        status: PaymentStatusEnum.FAILED,
        failureReason: 'PAYMENT_FAILED',
      }),
    );
    expect(create).toHaveBeenCalledWith(
      OutboxEventEntity,
      expect.objectContaining({
        type: 'payment.failed',
        status: OutboxStatusEnum.PENDING,
      }),
    );
  });

  it('rolls back and releases on an insert failure', async () => {
    save.mockRejectedValueOnce(new Error('database insert failed'));
    await expect(service.processBookingPayment(payload)).rejects.toThrow(
      'database insert failed',
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when outbox insert fails (preventing partial commit)', async () => {
    save
      .mockResolvedValueOnce({ id: 'c7b5d074-b5c5-48e0-82ee-4028ed1a4b99' })
      .mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(service.processBookingPayment(payload)).rejects.toThrow(
      'outbox insert failed',
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('does not rollback a transaction already marked inactive after an error', async () => {
    runner.isTransactionActive = false;
    execute.mockRejectedValueOnce(new Error('connection failure'));
    await expect(service.processBookingPayment(payload)).rejects.toThrow(
      'connection failure',
    );
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('releases query runner even if transaction start fails', async () => {
    runner.startTransaction.mockRejectedValueOnce(new Error('begin failed'));
    await expect(service.processBookingPayment(payload)).rejects.toThrow(
      'begin failed',
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});
