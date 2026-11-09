import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OutboxPublisher } from '../../src/modules/payment/outbox/outbox.publisher';
import { PaymentEventProducer } from '../../src/modules/payment/kafka/payment-event.producer';
import { OutboxStatusEnum } from '../../src/modules/payment/enums/outbox-status.enum';
import { OutboxEventEntity } from '../../src/modules/payment/entities/outbox-event.entity';

describe('OutboxPublisher (unit)', () => {
  let publisher: OutboxPublisher;
  const getMany = jest.fn();
  const take = jest.fn();
  const orderBy = jest.fn();
  const where = jest.fn();
  const setOnLocked = jest.fn();
  const setLock = jest.fn();
  const save = jest.fn();
  const createQueryBuilder = jest.fn();
  const send = jest.fn();
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: { createQueryBuilder, save },
  };
  const source = { createQueryRunner: jest.fn(() => runner) };

  const event = (retryCount = 0) => ({
    id: 'f95fd824-c64c-40f2-8ab2-f99a63c03a55',
    type: 'payment.completed',
    payload: { bookingId: 'booking-1' },
    status: OutboxStatusEnum.PENDING,
    retryCount,
    processedAt: null as Date | null,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    runner.isTransactionActive = true;
    for (const method of [
      runner.connect,
      runner.startTransaction,
      runner.commitTransaction,
      runner.rollbackTransaction,
      runner.release,
      save,
      send,
    ])
      method.mockResolvedValue(undefined);
    getMany.mockResolvedValue([]);
    take.mockReturnValue({ getMany });
    orderBy.mockReturnValue({ take });
    where.mockReturnValue({ orderBy });
    setOnLocked.mockReturnValue({ where });
    setLock.mockReturnValue({ setOnLocked });
    createQueryBuilder.mockReturnValue({ setLock });
    source.createQueryRunner.mockReturnValue(runner);
    const module = await Test.createTestingModule({
      providers: [
        OutboxPublisher,
        { provide: DataSource, useValue: source },
        { provide: PaymentEventProducer, useValue: { publisher: send } },
      ],
    }).compile();
    publisher = module.get(OutboxPublisher);
  });

  it('commits cleanly when no pending events are found', async () => {
    await publisher.publishPendingEvents();
    expect(createQueryBuilder).toHaveBeenCalledWith(OutboxEventEntity, 'event');
    expect(setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(where).toHaveBeenCalledWith('event.status = :status', {
      status: OutboxStatusEnum.PENDING,
    });
    expect(take).toHaveBeenCalledWith(20);
    expect(send).not.toHaveBeenCalled();
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('publishes and marks event PROCESSED only after producer succeeds', async () => {
    const item = event();
    getMany.mockResolvedValueOnce([item]);
    await publisher.publishPendingEvents();
    expect(send).toHaveBeenCalledWith(item.type, item.id, item.payload);
    expect(item.status).toBe(OutboxStatusEnum.PROCESSED);
    expect(item.processedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledWith(item);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('increments retryCount but remains PENDING when a send fails below threshold', async () => {
    const item = event(2);
    getMany.mockResolvedValueOnce([item]);
    send.mockRejectedValueOnce(new Error('Kafka unavailable'));
    await publisher.publishPendingEvents();
    expect(item.retryCount).toBe(3);
    expect(item.status).toBe(OutboxStatusEnum.PENDING);
    expect(save).toHaveBeenCalledWith(item);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('marks event FAILED at fifth unsuccessful attempt', async () => {
    const item = event(4);
    getMany.mockResolvedValueOnce([item]);
    send.mockRejectedValueOnce(new Error('Kafka unavailable'));
    await publisher.publishPendingEvents();
    expect(item.retryCount).toBe(5);
    expect(item.status).toBe(OutboxStatusEnum.FAILED);
  });

  it('continues processing remaining events after one producer failure', async () => {
    const first = event();
    const second = { ...event(), id: 'b1c95953-7f7a-4ac6-8900-9af0130f3430' };
    getMany.mockResolvedValueOnce([first, second]);
    send
      .mockRejectedValueOnce(new Error('temporary Kafka error'))
      .mockResolvedValueOnce(undefined);
    await publisher.publishPendingEvents();
    expect(first.retryCount).toBe(1);
    expect(second.status).toBe(OutboxStatusEnum.PROCESSED);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rolls back when querying pending events fails, and releases runner', async () => {
    getMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(publisher.publishPendingEvents()).resolves.toBeUndefined();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when saving retry state fails', async () => {
    getMany.mockResolvedValueOnce([event()]);
    send.mockRejectedValueOnce(new Error('Kafka unavailable'));
    save.mockRejectedValueOnce(new Error('DB write failed'));
    await publisher.publishPendingEvents();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});
