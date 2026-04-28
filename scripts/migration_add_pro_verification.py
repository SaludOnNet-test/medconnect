#!/usr/bin/env python3
"""Add pro verification — admin_users.is_verified / verification_request_id +
pro_verification_requests table.

Idempotent: each step checks for the column / table before creating it so the
migration can be run repeatedly. Safe to apply on a live DB.

Run:
    DB_PASSWORD=... python scripts/migration_add_pro_verification.py

What it does:
  1. admin_users.is_verified BIT NOT NULL DEFAULT 0 — set to 1 when ops
     approves a verification request. The /pro/dashboard banner +
     "Solicitar Liquidación" button gate on this column.
  2. admin_users.verification_request_id INT NULL — pointer to the most
     recent request. Same shape as `alta_request_id` for clinic alta.
  3. pro_verification_requests table — captures profile type (doctor vs
     clinic), the data the pro fills in the modal, the URLs of docs they
     uploaded to Vercel Blob, and the ops review state.

Pre-requisites:
  - The Vercel Blob store must exist with `BLOB_READ_WRITE_TOKEN` set in
    Vercel project env vars before /api/pro/verification can store files.
    The migration itself does not depend on Blob — only the runtime path.
"""

import os
import pymssql

print("Migration: add pro verification columns + pro_verification_requests table")

server = os.getenv('AZURE_SQL_SERVER', 'saludonai.database.windows.net')
database = os.getenv('AZURE_SQL_DATABASE', 'saludonai')
user = os.getenv('AZURE_SQL_USER', 'dbadmin')
password = os.getenv('DB_PASSWORD') or os.getenv('AZURE_SQL_PASSWORD')
if not password:
    raise SystemExit(
        'DB_PASSWORD (or AZURE_SQL_PASSWORD) env var is required. '
        'Re-run as: DB_PASSWORD=... python scripts/migration_add_pro_verification.py'
    )

conn = pymssql.connect(
    server=server, user=user, password=password, database=database,
    timeout=30, login_timeout=30,
)
cursor = conn.cursor()
print("[OK] Connected to Azure SQL")


def add_column_if_missing(table: str, column: str, ddl_type: str) -> None:
    cursor.execute(
        """
        IF NOT EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = %s AND COLUMN_NAME = %s
        )
        EXEC('ALTER TABLE ' + %s + ' ADD ' + %s + ' ' + %s)
        """,
        (table, column, table, column, ddl_type),
    )
    print(f"  [OK] {table}.{column} ({ddl_type})")


# 1. admin_users — verified flag + pointer to latest request.
print("Updating admin_users table...")
add_column_if_missing("admin_users", "is_verified", "BIT NOT NULL DEFAULT 0")
add_column_if_missing("admin_users", "verification_request_id", "INT NULL")

# 2. pro_verification_requests — pro-submitted verification entries.
print("Creating pro_verification_requests table (if missing)...")
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pro_verification_requests')
    CREATE TABLE pro_verification_requests (
        id INT IDENTITY PRIMARY KEY,
        requested_by_email NVARCHAR(255) NOT NULL,
        profile_type NVARCHAR(20) NOT NULL,           -- 'doctor' | 'clinic'
        full_name NVARCHAR(255) NULL,
        license_number NVARCHAR(100) NULL,             -- nº colegiado for 'doctor'
        clinic_name NVARCHAR(255) NULL,                -- razón social for 'clinic'
        tax_id NVARCHAR(40) NULL,                      -- CIF/NIF for 'clinic' (optional)
        document_urls NVARCHAR(MAX) NULL,              -- JSON array of Vercel Blob URLs
        notes NVARCHAR(MAX) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',-- pending|approved|rejected
        ops_notes NVARCHAR(MAX) NULL,
        resolved_by NVARCHAR(80) NULL,
        resolved_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    )
    """
)
print("  [OK] pro_verification_requests table ready")

# Indexes for the ops dashboard queries.
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_status' AND object_id = OBJECT_ID('pro_verification_requests'))
    CREATE INDEX IX_pro_verification_requests_status ON pro_verification_requests(status, created_at DESC)
    """
)
print("  [OK] index IX_pro_verification_requests_status")

cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pro_verification_requests_email' AND object_id = OBJECT_ID('pro_verification_requests'))
    CREATE INDEX IX_pro_verification_requests_email ON pro_verification_requests(requested_by_email)
    """
)
print("  [OK] index IX_pro_verification_requests_email")

conn.commit()
cursor.close()
conn.close()
print("Migration complete.")
