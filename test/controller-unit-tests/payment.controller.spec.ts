import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../src/modules/payment/payment.controller';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { ProcessPaymentDto } from '../../src/modules/payment/dto/process-payment.dto';

const input: ProcessPaymentDto = {
  eventId: 'a6f9da14-3886-4df2-8e19-4e49a14061e2',
  bookingId: 'b3b368ea-b65f-4d9c-a484-2dfdebb46c49',
  userId: '0a4af7c2-11dc-4a0b-a5d0-5b6b5c80e4e1',
  totalPrice: 150.5,
  currency: 'USD',
  idempotencyKey: 'booking-b3b368ea',
};

describe('PaymentController (unit)', () => {
  let controller: PaymentController;
  const processBookingPayment = jest.fn<Promise<void>, [ProcessPaymentDto]>();

  beforeEach(async () => {
    jest.clearAllMocks();
    processBookingPayment.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: { processBookingPayment } },
      ],
    }).compile();
    controller = module.get(PaymentController);
  });

  it('forwards the exact Kafka payload and acknowledges after successful processing', async () => {
    await expect(controller.handleBookingCreated(input)).resolves.toEqual({
      message: 'Payment request accepted and processing initiated.',
    });
    expect(processBookingPayment).toHaveBeenCalledTimes(1);
    expect(processBookingPayment).toHaveBeenCalledWith(input);
  });

  it('propagates a processing failure instead of reporting accepted', async () => {
    const failure = new Error('db unavailable');
    processBookingPayment.mockRejectedValueOnce(failure);
    await expect(controller.handleBookingCreated(input)).rejects.toBe(failure);
  });

  it('does not acknowledge before the payment service resolves', async () => {
    let resolve!: () => void;
    processBookingPayment.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    let completed = false;
    const task = controller.handleBookingCreated(input).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolve();
    await task;
    expect(completed).toBe(true);
  });
});
