import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPaymentSchema1791909622822 implements MigrationInterface {
  name = 'InitialPaymentSchema1791909622822';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" uuid NOT NULL, "user_id" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'USD', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "idempotency_key" character varying NOT NULL, "failure_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e86edf76dc2424f123b9023a2b2" UNIQUE ("booking_id"), CONSTRAINT "UQ_59dcef70bd19850783c84f840e5" UNIQUE ("idempotency_key"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "aggregate_type" character varying(100) NOT NULL, "aggregate_id" uuid NOT NULL, "type" character varying(100) NOT NULL, "payload" jsonb NOT NULL, "status" "public"."outbox_status_enum" NOT NULL DEFAULT 'PENDING', "retry_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, CONSTRAINT "chk_outbox_retry_count" CHECK ("retry_count" >= 0), CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_733fafe6b0ec20ec7c93fdbbca" ON "outbox_events"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_status_created" ON "outbox_events"  ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "processed_events" ("event_id" uuid NOT NULL, "event_type" character varying(100) NOT NULL, "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_585a690352092645ee665d70ac2" PRIMARY KEY ("event_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_events"`);
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_status_created"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_733fafe6b0ec20ec7c93fdbbca"`,
    );
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
  }
}
