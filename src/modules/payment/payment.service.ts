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
    const { eventId, bookingId, userId, totalPrice, currency, idempotencyKey } =
      payload;

    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      const result = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(ProcessedEventEntity)
        .values({
          eventId,
          eventType: 'booking.creat',
        })
        .orIgnore()
        .returning('event_id')
        .execute();

      if (Array.isArray(result.raw)) {
        const numberResult = result.raw.length;
        if (numberResult === 0) {
          this.logger.warn(`Duplicate event ignored: ${eventId}`);
          await queryRunner.commitTransaction();
          return;
        }
      }

      const existingPayment = await queryRunner.manager.findOne(PaymentEntity, {
        where: { bookingId },
      });

      if (existingPayment) {
        if (
          existingPayment.userId !== userId ||
          existingPayment.idempotencyKey !== idempotencyKey ||
          existingPayment.amount !== totalPrice.toFixed(2) ||
          existingPayment.currency.trim() !== currency
        ) {
          throw new Error(
            `Conflicting payment request for booking ${bookingId}`,
          );
        }

        this.logger.warn(`Payment already exists for booking: ${bookingId}`);

        await queryRunner.commitTransaction();
        return;
      }

      const isSuccess = totalPrice > 0;
      const status = isSuccess
        ? PaymentStatusEnum.SUCCESS
        : PaymentStatusEnum.FAILED;

      const payment = queryRunner.manager.create(PaymentEntity, {
        bookingId,
        userId,
        amount: totalPrice.toFixed(2),
        currency,
        status,
        idempotencyKey,
        failureReason: isSuccess ? null : 'PAYMENT_FAILED',
      });

      const savedPayment = await queryRunner.manager.save(payment);

      const outboxEvent = queryRunner.manager.create(OutboxEventEntity, {
        aggregateType: 'PAYMENT',
        aggregateId: savedPayment.id,
        type: isSuccess ? 'payment.completed' : 'payment.failed',
        payload: {
          paymentId: savedPayment.id,
          bookingId: savedPayment.bookingId,
          userId: savedPayment.userId,
          amount: savedPayment.amount,
          currency: savedPayment.currency,
          status: savedPayment.status,
        },
        status: OutboxStatusEnum.PENDING,
        retryCount: 0,
      });

      await queryRunner.manager.save(outboxEvent);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Payment successfully processed for booking: ${bookingId}`,
      );
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      this.logger.error(
        `Payment processing fail for booking: ${bookingId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
