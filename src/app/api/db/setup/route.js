import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';

// GET /api/db/setup
// Creates tables if they don't exist. Safe to call multiple times (idempotent).
// Protected: only runs when SETUP_SECRET header matches env var (or in dev).
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'Azure SQL env vars not configured' }, { status: 503 });
  }

  const secret = request.headers.get('x-setup-secret');
  const expected = process.env.DB_SETUP_SECRET || 'dev';
  if (secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = await getPool();

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'referrals')
      CREATE TABLE referrals (
        id              NVARCHAR(50)    NOT NULL PRIMARY KEY,
        state           NVARCHAR(30)    NOT NULL DEFAULT 'PENDING',
        patient_email   NVARCHAR(255)   NOT NULL,
        professional_email NVARCHAR(255),
        profession_name NVARCHAR(255),
        provider_id     INT,
        provider_name   NVARCHAR(255),
        slot_date       NVARCHAR(20),
        slot_time       NVARCHAR(10),
        fee             DECIMAL(10,2),
        specialty       NVARCHAR(100),
        patient_name    NVARCHAR(255),
        patient_phone   NVARCHAR(50),
        patient_address NVARCHAR(500),
        lock_in_warning_at DATETIMEOFFSET,
        completed_at    DATETIMEOFFSET,
        created_at      DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at      DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'bookings')
      CREATE TABLE bookings (
        id              NVARCHAR(50)    NOT NULL PRIMARY KEY,
        referral_id     NVARCHAR(50),
        patient_name    NVARCHAR(255),
        patient_email   NVARCHAR(255),
        patient_phone   NVARCHAR(50),
        patient_address NVARCHAR(500),
        provider_id     INT,
        provider_name   NVARCHAR(255),
        specialty       NVARCHAR(100),
        slot_date       NVARCHAR(20),
        slot_time       NVARCHAR(10),
        amount          DECIMAL(10,2),
        status          NVARCHAR(30)    NOT NULL DEFAULT 'confirmed',
        card_last4      NVARCHAR(4),
        has_insurance   BIT             NOT NULL DEFAULT 0,
        insurance_company NVARCHAR(100),
        notes           NVARCHAR(MAX),
        created_at      DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at      DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);

    // Add reminder_sent column to referrals if it doesn't exist yet (idempotent migration)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'reminder_sent' AND Object_ID = Object_ID('referrals')
      )
      ALTER TABLE referrals ADD reminder_sent BIT NOT NULL DEFAULT 0;
    `);

    // analytics_events table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'analytics_events')
      CREATE TABLE analytics_events (
        id          INT             IDENTITY PRIMARY KEY,
        event_name  NVARCHAR(64)    NOT NULL,
        session_id  NVARCHAR(64),
        properties  NVARCHAR(4000),
        page_url    NVARCHAR(512),
        created_at  DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);

    // clinic_schedules — real schedules imported from Doctoralia
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'clinic_schedules')
      CREATE TABLE clinic_schedules (
        id           INT             IDENTITY PRIMARY KEY,
        clinic_id    INT             NOT NULL,
        day_of_week  TINYINT         NOT NULL,
        start_time   NVARCHAR(5)     NOT NULL,
        end_time     NVARCHAR(5)     NOT NULL,
        is_available BIT             NOT NULL DEFAULT 1,
        source       NVARCHAR(50),
        created_at   DATETIMEOFFSET  DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_clinic_schedules_clinic_id' AND object_id = OBJECT_ID('clinic_schedules'))
        CREATE INDEX IX_clinic_schedules_clinic_id ON clinic_schedules(clinic_id);
    `);

    // ── Migration: payment_intent_id on bookings (for refunds) ─────────
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'payment_intent_id' AND Object_ID = Object_ID('bookings')
      )
      ALTER TABLE bookings ADD payment_intent_id NVARCHAR(80);
    `);

    // ── operations_cases: one case per booking that needs ops handling ─
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'operations_cases')
      CREATE TABLE operations_cases (
        id                       INT IDENTITY PRIMARY KEY,
        booking_id               NVARCHAR(50)   NOT NULL,
        status                   NVARCHAR(40)   NOT NULL DEFAULT 'pending_call',
        assigned_to              NVARCHAR(255),

        original_clinic_id       INT,
        original_clinic_name     NVARCHAR(255),
        original_slot_date       NVARCHAR(20),
        original_slot_time       NVARCHAR(10),

        alternative_clinic_id    INT,
        alternative_clinic_name  NVARCHAR(255),
        alternative_slot_date    NVARCHAR(20),
        alternative_slot_time    NVARCHAR(10),
        alternative_reason       NVARCHAR(500),

        amount_paid              DECIMAL(10,2),
        payment_to_clinic        DECIMAL(10,2),
        tier                     TINYINT,

        refund_id                NVARCHAR(80),
        refund_amount            DECIMAL(10,2),
        refund_reason            NVARCHAR(500),

        call_log                 NVARCHAR(MAX),
        ops_notes                NVARCHAR(MAX),
        patient_decision         NVARCHAR(40),
        patient_response_token   NVARCHAR(80),

        created_at               DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at               DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        resolved_at              DATETIMEOFFSET
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_operations_cases_status' AND object_id = OBJECT_ID('operations_cases'))
        CREATE INDEX IX_operations_cases_status ON operations_cases(status);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_operations_cases_booking_id' AND object_id = OBJECT_ID('operations_cases'))
        CREATE INDEX IX_operations_cases_booking_id ON operations_cases(booking_id);
    `);

    // ── admin_users: simple username/password auth for ops dashboard ───
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'admin_users')
      CREATE TABLE admin_users (
        id            INT IDENTITY PRIMARY KEY,
        username      NVARCHAR(80)  NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        display_name  NVARCHAR(120),
        role          NVARCHAR(20)  NOT NULL DEFAULT 'ops',
        is_active     BIT           NOT NULL DEFAULT 1,
        created_at    DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        last_login    DATETIMEOFFSET
      );
    `);

    // Seed default admin (Admin / ADMIN) if no admins exist yet
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM admin_users)
      INSERT INTO admin_users (username, password_hash, display_name, role)
      VALUES ('Admin', 'plain:ADMIN', 'Default Admin', 'admin');
    `);

    return NextResponse.json({ success: true, message: 'Schema ready (tables + migrations applied)' });
  } catch (err) {
    console.error('[db/setup]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
