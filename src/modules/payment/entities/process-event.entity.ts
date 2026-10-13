import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEventEntity {
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
  })
  eventId: string;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 100,
  })
  eventType: string;

  @CreateDateColumn({
    name: 'processed_at',
    type: 'timestamptz',
  })
  processedAt: Date;
}
