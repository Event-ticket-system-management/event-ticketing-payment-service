import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProcessPaymentDto } from '../../src/modules/payment/dto/process-payment.dto';

const valid = {
  eventId: 'a6f9da14-3886-4df2-8e19-4e49a14061e2',
  bookingId: 'b3b368ea-b65f-4d9c-a484-2dfdebb46c49',
  userId: '0a4af7c2-11dc-4a0b-a5d0-5b6b5c80e4e1',
  totalPrice: 10.5,
  currency: 'USD',
  idempotencyKey: 'key-1',
};

async function errors(changes: Record<string, unknown>) {
  return validate(plainToInstance(ProcessPaymentDto, { ...valid, ...changes }));
}

describe('ProcessPaymentDto validation (unit)', () => {
  it('accepts valid values including 2 decimal places', async () => {
    expect(await errors({ totalPrice: 10.99 })).toHaveLength(0);
  });

  it.each(['eventId', 'bookingId', 'userId'])(
    'rejects malformed %s',
    async (property) => {
      expect(
        (await errors({ [property]: 'not-a-uuid' })).map((e) => e.property),
      ).toContain(property);
    },
  );

  it.each([0, -1, 100000000, 5.123, '10.50', Number.NaN])(
    'rejects invalid amount %s',
    async (amount) => {
      expect(
        (await errors({ totalPrice: amount })).map((e) => e.property),
      ).toContain('totalPrice');
    },
  );

  it.each(['usd', 'US', 'USDD', '12A', ''])(
    'rejects invalid currency %s',
    async (currency) => {
      expect((await errors({ currency })).map((e) => e.property)).toContain(
        'currency',
      );
    },
  );

  it.each(['', '  ', 'x'.repeat(256)])(
    'rejects missing, blank or oversized idempotency key',
    async (key) => {
      expect(
        (await errors({ idempotencyKey: key })).map((e) => e.property),
      ).toContain('idempotencyKey');
    },
  );
});
