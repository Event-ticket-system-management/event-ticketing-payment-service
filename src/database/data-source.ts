import 'dotenv/config';
import { DataSource } from 'typeorm';
import { PaymentEntity } from '../modules/payment/entities/payment.entity';
import { OutboxEventEntity } from '../modules/payment/entities/outbox-event.entity';
import { ProcessedEventEntity } from '../modules/payment/entities/process-event.entity';

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

const dbPort = Number(requiredEnv('DB_PORT'));

if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error('DB_PORT must be a valid TCP port');
}

export const AppDataSource = new DataSource({
  type: 'postgres',

  host: requiredEnv('DB_HOST'),
  port: dbPort,
  username: requiredEnv('DB_USERNAME'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),

  entities: [PaymentEntity, OutboxEventEntity, ProcessedEventEntity],

  migrations: [__dirname + '/migrations/*{.ts,.js}'],

  synchronize: false,

  migrationsTableName: 'typeorm_migrations',

  migrationsTransactionMode: 'all',
});
