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

    // ── Migration: clerk_user_id + linked_at on bookings ───────────────
    //
    // Link a paid booking to the patient's Clerk account when we know it.
    // Two write paths fill this in:
    //
    //   1. POST /api/bookings — if the booker is signed in to Clerk and the
    //      patient_email matches one of their verified emails, we stamp
    //      clerk_user_id immediately. Same-session: "you booked while
    //      logged in, you see it in /mi-cuenta right away".
    //   2. Clerk webhook user.created (patient signup branch) — when a new
    //      account is created whose verified email matches one or more
    //      `bookings.patient_email` rows with NULL clerk_user_id, we UPDATE
    //      them in place. Covers the common case where a patient buys
    //      logged out, then clicks "Crear mi cuenta" on the success screen.
    //
    // linked_at records WHICH path stamped the row (NULL → stamped at
    // insert; non-NULL → backfilled by the webhook). Useful for the
    // marketing funnel question "what % of post-purchase signups
    // converted into linked accounts?".
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'clerk_user_id' AND Object_ID = Object_ID('bookings')
      )
      ALTER TABLE bookings ADD clerk_user_id NVARCHAR(255) NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'linked_at' AND Object_ID = Object_ID('bookings')
      )
      ALTER TABLE bookings ADD linked_at DATETIMEOFFSET NULL;
    `);
    // Index for the webhook backfill query (UPDATE…WHERE LOWER(patient_email))
    // and for /api/bookings/mine. Azure SQL's default collation is
    // case-insensitive, so a plain index on the column is enough.
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_bookings_patient_email'
          AND object_id = OBJECT_ID('bookings')
      )
      CREATE INDEX IX_bookings_patient_email ON bookings(patient_email);
    `);
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_bookings_clerk_user_id'
          AND object_id = OBJECT_ID('bookings')
      )
      CREATE INDEX IX_bookings_clerk_user_id ON bookings(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
    `);

    // ── Migration: self_service_token on bookings (F2) ─────────────────
    // Lets the patient cancel or request a reschedule from a link in the
    // confirmation email without having to authenticate. Token is a 32-char
    // hex string generated when the booking is inserted.
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'self_service_token' AND Object_ID = Object_ID('bookings')
      )
      ALTER TABLE bookings ADD self_service_token NVARCHAR(64) NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_bookings_self_service_token'
          AND object_id = OBJECT_ID('bookings')
      )
      CREATE UNIQUE INDEX IX_bookings_self_service_token
        ON bookings(self_service_token) WHERE self_service_token IS NOT NULL;
    `);

    // ── Migration: self_service_token_expires_at ──────────────────────
    // Cancel/reschedule tokens go in confirmation emails that may live
    // forever in the patient's inbox. We hard-cap their lifetime here
    // (90 days from booking creation) so a leaked email doesn't yield an
    // indefinite cancel-and-refund primitive months later.
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = 'self_service_token_expires_at' AND Object_ID = Object_ID('bookings')
      )
      ALTER TABLE bookings ADD self_service_token_expires_at DATETIMEOFFSET NULL;
    `);
    await pool.request().query(`
      UPDATE bookings
      SET self_service_token_expires_at = DATEADD(day, 90, created_at)
      WHERE self_service_token IS NOT NULL
        AND self_service_token_expires_at IS NULL;
    `);

    // ── Performance indexes (idempotent) ─────────────────────────────
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bookings_created_at' AND object_id = OBJECT_ID('bookings'))
      CREATE INDEX IX_bookings_created_at ON bookings(created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bookings_slot_status' AND object_id = OBJECT_ID('bookings'))
      CREATE INDEX IX_bookings_slot_status ON bookings(slot_date, status);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bookings_payment_intent' AND object_id = OBJECT_ID('bookings'))
      CREATE INDEX IX_bookings_payment_intent ON bookings(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
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

    // No automatic seed. Earlier versions inserted ('Admin', 'plain:ADMIN')
    // when admin_users was empty — a guessable username/password pair
    // sitting on production. Combined with a credentials hint block on
    // /admin/login (removed in the same change), anyone who reached the
    // page could log in.
    //
    // To create the first admin on a fresh database, call `createAdmin`
    // from `src/lib/adminAuth.js` directly via a one-off Node script with
    // a strong password. Subsequent admins are added through the dashboard
    // by an existing admin.

    // ── Migration: clinic onboarding (clinic_id + alta_request_id + clinic_alta_requests) ──
    // Mirrors scripts/migration_add_clinic_alta_requests.py. Pro picks an
    // existing clinic in onboarding -> admin_users.clinic_id is set. If their
    // clinic isn't in the DB they fill clinic_alta_requests and ops review it.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'clinic_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD clinic_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'alta_request_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD alta_request_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'clinic_alta_requests')
      CREATE TABLE clinic_alta_requests (
        id                  INT IDENTITY PRIMARY KEY,
        requested_by_email  NVARCHAR(255) NOT NULL,
        requested_by_name   NVARCHAR(255) NULL,
        clinic_name         NVARCHAR(255) NOT NULL,
        city                NVARCHAR(120) NULL,
        province            NVARCHAR(120) NULL,
        address             NVARCHAR(500) NULL,
        telephone           NVARCHAR(40)  NULL,
        contact_email       NVARCHAR(255) NULL,
        specialties         NVARCHAR(MAX) NULL,
        aseguradoras        NVARCHAR(MAX) NULL,
        notes               NVARCHAR(MAX) NULL,
        status              NVARCHAR(20)  NOT NULL DEFAULT 'pending',
        linked_clinic_id    INT           NULL,
        ops_notes           NVARCHAR(MAX) NULL,
        resolved_by         NVARCHAR(80)  NULL,
        resolved_at         DATETIMEOFFSET NULL,
        created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_alta_requests_status_created_at' AND object_id = OBJECT_ID('clinic_alta_requests'))
      CREATE INDEX IX_clinic_alta_requests_status_created_at ON clinic_alta_requests(status, created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_admin_users_clinic_id' AND object_id = OBJECT_ID('admin_users'))
      CREATE INDEX IX_admin_users_clinic_id ON admin_users(clinic_id) WHERE clinic_id IS NOT NULL;
    `);

    // IBAN capture on clinic_alta_requests so clinics can register their
    // payout account during onboarding. Optional, additive — existing rows
    // stay NULL. SEPA IBANs cap at 34 chars (Spain is 24).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'iban' AND Object_ID = Object_ID('clinic_alta_requests'))
      ALTER TABLE clinic_alta_requests ADD iban NVARCHAR(34) NULL;
    `);

    // is_internal flag on referrals: 1 when the derivador's clinic equals
    // the destination clinic (derivación interna), 0 when it's a different
    // clinic (derivación externa), NULL when we couldn't classify because
    // the derivador isn't mapped to a clinic_id. The commissions API treats
    // NULL as external (safer default — yields the smaller commission).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'is_internal' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD is_internal BIT NULL;
    `);
    // slot_source on referrals: 'list' when the pro picked from the
    // generated available-slots grid, 'manual' when they used the
    // internal-derivation escape hatch in ReferralModal (typed a date+time
    // directly). Persisted for audit so we can later ask "¿cuántas
    // derivaciones internas usaron slot manual y luego no convirtieron?".
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'slot_source' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD slot_source NVARCHAR(20) NULL;
    `);
    // verified_derivador on referrals:
    //   NULL  → legacy / no professionalEmail provided at create
    //   1     → Clerk session matched the professionalEmail in the body
    //           (canonical /pro/dashboard ReferralModal path)
    //   0     → anon POST (legitimate /book external derivar OR patient
    //           recovery upsert from /lock-in/[id]).
    // Ops uses this to triage referrals when a complaint of fraud comes in.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'verified_derivador' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD verified_derivador BIT NULL;
    `);
    // alternative_proposed_at on operations_cases: timestamp set when Ops
    // proposes an alternative slot/clinic. Drives the 24h response window
    // shown in the Ops dashboard (Aceptada / Rechazada / Sin respuesta /
    // Expirada). Lazy expiration — the UI computes "expired" from this
    // timestamp + 24h, no background cron needed.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'alternative_proposed_at' AND Object_ID = Object_ID('operations_cases'))
      ALTER TABLE operations_cases ADD alternative_proposed_at DATETIMEOFFSET NULL;
    `);
    // referral_id on operations_cases: NULL for direct bookings, set to the
    // originating referral id when the case was created from an external
    // lock-in payment. Lets /admin/ops show a "derivación externa" chip and
    // surface the derivador context (clinic + email) on the case detail.
    // Internal lock-ins don't create cases at all (the deriving clinic is
    // the receiving clinic — self-managed).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'referral_id' AND Object_ID = Object_ID('operations_cases'))
      ALTER TABLE operations_cases ADD referral_id NVARCHAR(50) NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_operations_cases_referral_id' AND object_id = OBJECT_ID('operations_cases'))
      CREATE INDEX IX_operations_cases_referral_id ON operations_cases(referral_id) WHERE referral_id IS NOT NULL;
    `);
    // Backfill is_internal for existing referrals — idempotent because the
    // WHERE clause limits to rows that are still NULL. Mirrors the logic
    // in scripts/migrate_referrals_is_internal.js so calling /api/db/setup
    // is enough to fully migrate the column. Rows where the derivador's
    // admin_users row has no clinic_id stay NULL and are treated as
    // external by the commissions API.
    await pool.request().query(`
      UPDATE r
      SET is_internal = CASE WHEN a.clinic_id = r.provider_id THEN 1 ELSE 0 END
      FROM referrals r
      JOIN admin_users a ON LOWER(a.username) = LOWER(r.professional_email)
      WHERE r.is_internal IS NULL
        AND a.clinic_id IS NOT NULL
        AND r.provider_id IS NOT NULL;
    `);

    // ── Migration: pro verification (is_verified + verification_request_id + pro_verification_requests) ──
    // Mirrors scripts/migration_add_pro_verification.py. Pro submits the
    // verification modal -> pro_verification_requests row + ops review flips
    // admin_users.is_verified.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'is_verified' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD is_verified BIT NOT NULL DEFAULT 0;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'verification_request_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD verification_request_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pro_verification_requests')
      CREATE TABLE pro_verification_requests (
        id                  INT IDENTITY PRIMARY KEY,
        requested_by_email  NVARCHAR(255) NOT NULL,
        profile_type        NVARCHAR(20)  NOT NULL,
        full_name           NVARCHAR(255) NULL,
        license_number      NVARCHAR(100) NULL,
        clinic_name         NVARCHAR(255) NULL,
        tax_id              NVARCHAR(40)  NULL,
        document_urls       NVARCHAR(MAX) NULL,
        notes               NVARCHAR(MAX) NULL,
        status              NVARCHAR(20)  NOT NULL DEFAULT 'pending',
        ops_notes           NVARCHAR(MAX) NULL,
        resolved_by         NVARCHAR(80)  NULL,
        resolved_at         DATETIMEOFFSET NULL,
        created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_status' AND object_id = OBJECT_ID('pro_verification_requests'))
      CREATE INDEX IX_pro_verification_requests_status ON pro_verification_requests(status, created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_email' AND object_id = OBJECT_ID('pro_verification_requests'))
      CREATE INDEX IX_pro_verification_requests_email ON pro_verification_requests(requested_by_email);
    `);

    // ── Migration: "request more info" flow ────────────────────────────
    // Adds the columns both ops review tables need to capture an ops
    // message asking the pro for clarification, and to track when the pro
    // responded. Status uses the new value 'more_info_requested' (existing
    // NVARCHAR(20) column fits; no enum to extend).
    for (const tbl of ['clinic_alta_requests', 'pro_verification_requests']) {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_request_message' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_request_message NVARCHAR(MAX) NULL;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_request_at' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_request_at DATETIMEOFFSET NULL;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_response_at' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_response_at DATETIMEOFFSET NULL;
      `);
    }

    // ── Migration: clinic onboarding (clinic_id + alta_request_id + clinic_alta_requests) ──
    // Mirrors scripts/migration_add_clinic_alta_requests.py. Pro picks an
    // existing clinic in onboarding -> admin_users.clinic_id is set. If their
    // clinic isn't in the DB they fill clinic_alta_requests and ops review it.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'clinic_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD clinic_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'alta_request_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD alta_request_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'clinic_alta_requests')
      CREATE TABLE clinic_alta_requests (
        id                  INT IDENTITY PRIMARY KEY,
        requested_by_email  NVARCHAR(255) NOT NULL,
        requested_by_name   NVARCHAR(255) NULL,
        clinic_name         NVARCHAR(255) NOT NULL,
        city                NVARCHAR(120) NULL,
        province            NVARCHAR(120) NULL,
        address             NVARCHAR(500) NULL,
        telephone           NVARCHAR(40)  NULL,
        contact_email       NVARCHAR(255) NULL,
        specialties         NVARCHAR(MAX) NULL,
        aseguradoras        NVARCHAR(MAX) NULL,
        notes               NVARCHAR(MAX) NULL,
        status              NVARCHAR(20)  NOT NULL DEFAULT 'pending',
        linked_clinic_id    INT           NULL,
        ops_notes           NVARCHAR(MAX) NULL,
        resolved_by         NVARCHAR(80)  NULL,
        resolved_at         DATETIMEOFFSET NULL,
        created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_alta_requests_status_created_at' AND object_id = OBJECT_ID('clinic_alta_requests'))
      CREATE INDEX IX_clinic_alta_requests_status_created_at ON clinic_alta_requests(status, created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_admin_users_clinic_id' AND object_id = OBJECT_ID('admin_users'))
      CREATE INDEX IX_admin_users_clinic_id ON admin_users(clinic_id) WHERE clinic_id IS NOT NULL;
    `);

    // IBAN capture on clinic_alta_requests so clinics can register their
    // payout account during onboarding. Optional, additive — existing rows
    // stay NULL. SEPA IBANs cap at 34 chars (Spain is 24).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'iban' AND Object_ID = Object_ID('clinic_alta_requests'))
      ALTER TABLE clinic_alta_requests ADD iban NVARCHAR(34) NULL;
    `);

    // is_internal flag on referrals: 1 when the derivador's clinic equals
    // the destination clinic (derivación interna), 0 when it's a different
    // clinic (derivación externa), NULL when we couldn't classify because
    // the derivador isn't mapped to a clinic_id. The commissions API treats
    // NULL as external (safer default — yields the smaller commission).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'is_internal' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD is_internal BIT NULL;
    `);
    // slot_source on referrals: 'list' when the pro picked from the
    // generated available-slots grid, 'manual' when they used the
    // internal-derivation escape hatch in ReferralModal (typed a date+time
    // directly). Persisted for audit so we can later ask "¿cuántas
    // derivaciones internas usaron slot manual y luego no convirtieron?".
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'slot_source' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD slot_source NVARCHAR(20) NULL;
    `);
    // verified_derivador on referrals:
    //   NULL  → legacy / no professionalEmail provided at create
    //   1     → Clerk session matched the professionalEmail in the body
    //           (canonical /pro/dashboard ReferralModal path)
    //   0     → anon POST (legitimate /book external derivar OR patient
    //           recovery upsert from /lock-in/[id]).
    // Ops uses this to triage referrals when a complaint of fraud comes in.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'verified_derivador' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD verified_derivador BIT NULL;
    `);
    // alternative_proposed_at on operations_cases: timestamp set when Ops
    // proposes an alternative slot/clinic. Drives the 24h response window
    // shown in the Ops dashboard (Aceptada / Rechazada / Sin respuesta /
    // Expirada). Lazy expiration — the UI computes "expired" from this
    // timestamp + 24h, no background cron needed.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'alternative_proposed_at' AND Object_ID = Object_ID('operations_cases'))
      ALTER TABLE operations_cases ADD alternative_proposed_at DATETIMEOFFSET NULL;
    `);
    // referral_id on operations_cases: NULL for direct bookings, set to the
    // originating referral id when the case was created from an external
    // lock-in payment. Lets /admin/ops show a "derivación externa" chip and
    // surface the derivador context (clinic + email) on the case detail.
    // Internal lock-ins don't create cases at all (the deriving clinic is
    // the receiving clinic — self-managed).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'referral_id' AND Object_ID = Object_ID('operations_cases'))
      ALTER TABLE operations_cases ADD referral_id NVARCHAR(50) NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_operations_cases_referral_id' AND object_id = OBJECT_ID('operations_cases'))
      CREATE INDEX IX_operations_cases_referral_id ON operations_cases(referral_id) WHERE referral_id IS NOT NULL;
    `);
    // Backfill is_internal for existing referrals — idempotent because the
    // WHERE clause limits to rows that are still NULL. Mirrors the logic
    // in scripts/migrate_referrals_is_internal.js so calling /api/db/setup
    // is enough to fully migrate the column. Rows where the derivador's
    // admin_users row has no clinic_id stay NULL and are treated as
    // external by the commissions API.
    await pool.request().query(`
      UPDATE r
      SET is_internal = CASE WHEN a.clinic_id = r.provider_id THEN 1 ELSE 0 END
      FROM referrals r
      JOIN admin_users a ON LOWER(a.username) = LOWER(r.professional_email)
      WHERE r.is_internal IS NULL
        AND a.clinic_id IS NOT NULL
        AND r.provider_id IS NOT NULL;
    `);

    // ── Migration: pro verification (is_verified + verification_request_id + pro_verification_requests) ──
    // Mirrors scripts/migration_add_pro_verification.py. Pro submits the
    // verification modal -> pro_verification_requests row + ops review flips
    // admin_users.is_verified.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'is_verified' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD is_verified BIT NOT NULL DEFAULT 0;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'verification_request_id' AND Object_ID = Object_ID('admin_users'))
      ALTER TABLE admin_users ADD verification_request_id INT NULL;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pro_verification_requests')
      CREATE TABLE pro_verification_requests (
        id                  INT IDENTITY PRIMARY KEY,
        requested_by_email  NVARCHAR(255) NOT NULL,
        profile_type        NVARCHAR(20)  NOT NULL,
        full_name           NVARCHAR(255) NULL,
        license_number      NVARCHAR(100) NULL,
        clinic_name         NVARCHAR(255) NULL,
        tax_id              NVARCHAR(40)  NULL,
        document_urls       NVARCHAR(MAX) NULL,
        notes               NVARCHAR(MAX) NULL,
        status              NVARCHAR(20)  NOT NULL DEFAULT 'pending',
        ops_notes           NVARCHAR(MAX) NULL,
        resolved_by         NVARCHAR(80)  NULL,
        resolved_at         DATETIMEOFFSET NULL,
        created_at          DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_status' AND object_id = OBJECT_ID('pro_verification_requests'))
      CREATE INDEX IX_pro_verification_requests_status ON pro_verification_requests(status, created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_email' AND object_id = OBJECT_ID('pro_verification_requests'))
      CREATE INDEX IX_pro_verification_requests_email ON pro_verification_requests(requested_by_email);
    `);

    // ── Migration: "request more info" flow ────────────────────────────
    // Adds the columns both ops review tables need to capture an ops
    // message asking the pro for clarification, and to track when the pro
    // responded. Status uses the new value 'more_info_requested' (existing
    // NVARCHAR(20) column fits; no enum to extend).
    for (const tbl of ['clinic_alta_requests', 'pro_verification_requests']) {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_request_message' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_request_message NVARCHAR(MAX) NULL;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_request_at' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_request_at DATETIMEOFFSET NULL;
      `);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'info_response_at' AND Object_ID = Object_ID('${tbl}'))
        ALTER TABLE ${tbl} ADD info_response_at DATETIMEOFFSET NULL;
      `);
    }

    // ── Performance indexes for hot read paths (2026-05 security audit) ──
    // Idempotent. Already applied to prod via
    // scripts/migration_2026-05_security_hardening.py — kept here so a
    // fresh DB bootstrapped via /api/db/setup is also up to date.
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clinic_specialties')
      AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_specialties_clinic_id' AND object_id = OBJECT_ID('clinic_specialties'))
      CREATE INDEX IX_clinic_specialties_clinic_id ON clinic_specialties(clinic_id);
    `);
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clinic_specialties')
      AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_specialties_slug' AND object_id = OBJECT_ID('clinic_specialties'))
      CREATE INDEX IX_clinic_specialties_slug ON clinic_specialties(specialty_slug);
    `);
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clinic_procedures')
      AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_procedures_clinic_slug' AND object_id = OBJECT_ID('clinic_procedures'))
      CREATE INDEX IX_clinic_procedures_clinic_slug ON clinic_procedures(clinic_id, procedure_slug);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_referrals_state_created_at' AND object_id = OBJECT_ID('referrals'))
      CREATE INDEX IX_referrals_state_created_at ON referrals(state, created_at DESC);
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_referrals_reminder_pending' AND object_id = OBJECT_ID('referrals'))
      CREATE INDEX IX_referrals_reminder_pending ON referrals(reminder_sent, created_at) WHERE state = 'PENDING' AND reminder_sent = 0;
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_analytics_events_event_created_at' AND object_id = OBJECT_ID('analytics_events'))
      CREATE INDEX IX_analytics_events_event_created_at ON analytics_events(event_name, created_at DESC);
    `);

    // ── N15: post-cita reviews + Trustpilot bridge ──────────────────────
    // Two-rating model: Med Connect rating (required, "how fast did we
    // get you the appointment?") + clinic rating (optional, "how was the
    // service?"). One row per booking enforced via UNIQUE (booking_id);
    // POST endpoint relies on the unique-violation to reject duplicate
    // submissions without a separate "exists" round-trip.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'reviews')
      CREATE TABLE reviews (
        id                   INT IDENTITY PRIMARY KEY,
        booking_id           NVARCHAR(50)  NOT NULL,
        rating_medconnect    TINYINT       NOT NULL CHECK (rating_medconnect BETWEEN 1 AND 5),
        rating_clinic        TINYINT       NULL CHECK (rating_clinic BETWEEN 1 AND 5),
        comment_medconnect   NVARCHAR(2000) NULL,
        comment_clinic       NVARCHAR(2000) NULL,
        trustpilot_clicked   BIT           NOT NULL DEFAULT 0,
        submitter_ip         NVARCHAR(45)  NULL,
        submitter_user_agent NVARCHAR(500) NULL,
        submitted_at         DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT UQ_reviews_booking UNIQUE (booking_id),
        CONSTRAINT FK_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_reviews_submitted_at' AND object_id = OBJECT_ID('reviews'))
      CREATE INDEX IX_reviews_submitted_at ON reviews(submitted_at DESC);
    `);
    // Idempotency column on bookings — set by the request-batch cron when
    // the review-request email is sent so re-runs on the same day skip
    // already-emailed bookings. Mirrors the voucher idempotency pattern.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'review_request_sent_at' AND Object_ID = Object_ID('bookings'))
      ALTER TABLE bookings ADD review_request_sent_at DATETIMEOFFSET NULL;
    `);

    return NextResponse.json({ success: true, message: 'Schema ready (tables + migrations applied)' });
  } catch (err) {
    console.error('[db/setup]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
