import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { OutboxStatusEnum } from '../enums/outbox-status.enum';

@Entity('outbox_events')
@Check('chk_outbox_retry_count', '"retry_count" >= 0')
@Index('idx_outbox_status_created', ['status', 'createdAt'])
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 100 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Index()
  @Column({
    type: 'enum',
    enum: OutboxStatusEnum,
    enumName: 'outbox_status_enum',
    default: OutboxStatusEnum.PENDING,
  })
  status: OutboxStatusEnum;

  @Column({ name: 'retry_count', default: 0, type: 'integer' })
  retryCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'processed_at', nullable: true, type: 'timestamp' })
  processedAt: Date | null;
}
