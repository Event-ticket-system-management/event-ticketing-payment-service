import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
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

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
