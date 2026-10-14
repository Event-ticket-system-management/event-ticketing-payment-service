import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PaymentEventProducer } from '../kafka/payment-event.producer';
import { OutboxEventEntity } from '../entities/outbox-event.entity';
import { OutboxStatusEnum } from '../enums/outbox-status.enum';

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly producer: PaymentEventProducer,
  ) {
    this.logger.log('OutboxPublisher initialized');
  }

  @Cron(CronExpression.EVERY_5_SECONDS, {
    waitForCompletion: true,
  })
  async publishPendingEvents(): Promise<void> {
    this.logger.log('Outbox Cron triggered');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      const events = await queryRunner.manager
        .createQueryBuilder(OutboxEventEntity, 'event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.status = :status', {
          status: OutboxStatusEnum.PENDING,
        })
        .orderBy('event.createdAt', 'ASC')
        .take(20)
        .getMany();
      this.logger.log(`Pending events found: ${events.length}`);
      for (const event of events) {
        try {
          await this.producer.publisher(event.type, event.id, event.payload);

          event.status = OutboxStatusEnum.PROCESSED;
          event.processedAt = new Date();

          await queryRunner.manager.save(event);

          this.logger.log(`Published ${event.type}: ${event.id}`);
        } catch (error: unknown) {
          event.retryCount += 1;

          if (event.retryCount >= 5) {
            event.status = OutboxStatusEnum.FAILED;
          }

          await queryRunner.manager.save(event);

          this.logger.error(
            `Failed to publish event ${event.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      this.logger.error(
        'Outbox publishing cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      await queryRunner.release();
    }
  }
}
