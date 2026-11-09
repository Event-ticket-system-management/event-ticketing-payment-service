import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { ProcessedEventEntity } from './entities/process-event.entity';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentEventProducer } from './kafka/payment-event.producer';
import { OutboxPublisher } from './outbox/outbox.publisher';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, ProcessedEventEntity])],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentEventProducer, OutboxPublisher],
  exports: [PaymentService],
})
export class PaymentModule {}
