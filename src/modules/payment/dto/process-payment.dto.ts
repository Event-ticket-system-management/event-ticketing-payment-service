import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

export class ProcessPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  eventId!: string;

  @IsUUID()
  @IsNotEmpty()
  bookingId!: string;

  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999999.99)
  totalPrice!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter uppercase code',
  })
  currency!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'Idempotency key cannot be blank',
  })
  @MaxLength(255)
  idempotencyKey!: string;
}
