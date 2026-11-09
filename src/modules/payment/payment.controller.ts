import { Controller, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @MessagePattern('booking.create')
  async handleBookingCreated(@Payload() payload: ProcessPaymentDto) {
    this.logger.log(`Received Kafka event from 'booking-events' topic`);
    await this.paymentService.processBookingPayment(payload);
    return {
      message: 'Payment request accepted and processing initiated.',
    };
  }
}
