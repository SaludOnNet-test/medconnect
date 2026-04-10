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

    return NextResponse.json({ success: true, message: 'Schema ready (tables + migrations applied)' });
  } catch (err) {
    console.error('[db/setup]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
