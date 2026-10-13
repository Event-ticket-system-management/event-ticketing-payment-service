import { Controller, Post, Body } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ProcessPaymentDto } from './dto/process-payment.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('process')
  async processPayment(@Body() dto: ProcessPaymentDto) {
    await this.paymentService.processBookingPayment(dto);
    return {
      message: 'Payment request accepted and processing initiated.',
    };
  }
}
