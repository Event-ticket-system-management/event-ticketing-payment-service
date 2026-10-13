import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProcessedEventEntity } from './entities/process-event.entity';
import { PaymentStatusEnum } from './enums/payment-status.enum';
import { PaymentEntity } from './entities/payment.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { OutboxStatusEnum } from './enums/outbox-status.enum';
import { ProcessPaymentDto } from './dto/process-payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly datasource: DataSource) {}

  async processBookingPayment(payload: ProcessPaymentDto): Promise<void> {
    const { eventId, bookingId, userId, amount, currency, idempotencyKey } =
      payload;

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingEvent = await queryRunner.manager.findOne(
        ProcessedEventEntity,
        {
          where: { eventId },
        },
      );

      if (existingEvent) {
        this.logger.warn(`Event ${eventId} already processed. Skipping.`);
        await queryRunner.rollbackTransaction();
        return;
      }

      const isSuccess = amount > 0;
      const status = isSuccess
        ? PaymentStatusEnum.SUCCESS
        : PaymentStatusEnum.FAILED;

      const payment = queryRunner.manager.create(PaymentEntity, {
        bookingId,
        userId,
        amount: amount.toString(),
        currency,
        status,
        idempotencyKey,
        failureReason: isSuccess ? null : 'INVALID_AMOUNT',
      });

      const savedPayment = await queryRunner.manager.save(payment);

      const outboxEvent = queryRunner.manager.create(OutboxEventEntity, {
        aggregateType: 'PAYMENT',
        aggregateId: savedPayment.id,
        type: isSuccess ? 'payment.completed' : 'payment.failed',
        payload: {
          paymentId: savedPayment.id,
          bookingId: savedPayment.bookingId,
          status: savedPayment.status,
        },
        status: OutboxStatusEnum.PENDING,
      });

      await queryRunner.manager.save(outboxEvent);

      const processEvent = queryRunner.manager.create(ProcessedEventEntity, {
        eventId,
        eventType: 'booking.created',
      });

      await queryRunner.manager.save(processEvent);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Payment successfully processed for booking: ${bookingId}`,
      );
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (error instanceof Error){
        this.logger.error(
          `Error processing payment for booking: ${bookingId}`,
          error.stack,
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
