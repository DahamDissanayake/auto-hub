import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDevicesAndLoginEvents1750600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT UNIQUE NOT NULL,
        name TEXT,
        "userAgent" TEXT,
        browser TEXT,
        os TEXT,
        ip TEXT,
        "isPermanent" BOOLEAN NOT NULL DEFAULT false,
        "firstSeen" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "lastSeen" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE login_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "deviceId" UUID REFERENCES devices(id) ON DELETE SET NULL,
        ip TEXT NOT NULL,
        browser TEXT,
        os TEXT,
        "eventType" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_login_events_created_at ON login_events ("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX idx_login_events_device_id ON login_events ("deviceId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_login_events_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_login_events_device_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS login_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS devices`);
  }
}
