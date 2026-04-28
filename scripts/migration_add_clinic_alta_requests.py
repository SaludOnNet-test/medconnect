#!/usr/bin/env python3
"""Add clinic onboarding (G2) — admin_users.clinic_id / alta_request_id +
clinic_alta_requests table.

Idempotent: each step checks for the column / table before creating it so the
migration can be run repeatedly. Safe to apply on a live DB.

Run:
    python scripts/migration_add_clinic_alta_requests.py

What it does:
  1. admin_users.clinic_id INT NULL — once set, the pro user is mapped to that
     clinic. /api/pro/me joins on this to expose myClinic to the dashboard +
     ReferralModal (item 10 of the user-feedback round).
  2. admin_users.alta_request_id INT NULL — points to the pending alta
     request when the user is not yet attached. Lets /api/pro/me return
     altaStatus = 'pending' so the modal shows the explanatory gate.
  3. clinic_alta_requests table — captures the data the pro fills when their
     clinic isn't in the DB yet. Ops review it and either:
       - approve: create a clinics row + set admin_users.clinic_id, OR
       - reject: status = 'rejected' + ops_notes.
"""

import os
import pymssql

print("Migration: add clinic onboarding columns + clinic_alta_requests table")

server = os.getenv('AZURE_SQL_SERVER', 'saludonai.database.windows.net')
database = os.getenv('AZURE_SQL_DATABASE', 'saludonai')
user = os.getenv('AZURE_SQL_USER', 'dbadmin')
password = os.getenv('DB_PASSWORD') or os.getenv('AZURE_SQL_PASSWORD')
if not password:
    raise SystemExit(
        'DB_PASSWORD (or AZURE_SQL_PASSWORD) env var is required. '
        'Re-run as: DB_PASSWORD=... python scripts/migration_add_clinic_alta_requests.py'
    )

conn = pymssql.connect(
    server=server,
    user=user,
    password=password,
    database=database,
    timeout=30,
    login_timeout=30,
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


# 1. admin_users — clinic mapping + pending alta pointer.
print("Updating admin_users table...")
add_column_if_missing("admin_users", "clinic_id", "INT NULL")
add_column_if_missing("admin_users", "alta_request_id", "INT NULL")

# 2. clinic_alta_requests — pro-submitted onboarding requests.
print("Creating clinic_alta_requests table (if missing)...")
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clinic_alta_requests')
    CREATE TABLE clinic_alta_requests (
        id INT IDENTITY PRIMARY KEY,
        requested_by_email NVARCHAR(255) NOT NULL,
        requested_by_name NVARCHAR(255) NULL,
        clinic_name NVARCHAR(255) NOT NULL,
        city NVARCHAR(120) NULL,
        province NVARCHAR(120) NULL,
        address NVARCHAR(500) NULL,
        telephone NVARCHAR(40) NULL,
        contact_email NVARCHAR(255) NULL,
        specialties NVARCHAR(MAX) NULL,
        aseguradoras NVARCHAR(MAX) NULL,
        notes NVARCHAR(MAX) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'pending',
        linked_clinic_id INT NULL,
        ops_notes NVARCHAR(MAX) NULL,
        resolved_by NVARCHAR(80) NULL,
        resolved_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    )
    """
)
print("  [OK] clinic_alta_requests table ready")

# Helpful index for ops dashboard queries (filter by status + age).
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_alta_requests_status_created_at' AND object_id = OBJECT_ID('clinic_alta_requests'))
    CREATE INDEX IX_clinic_alta_requests_status_created_at ON clinic_alta_requests(status, created_at DESC)
    """
)
print("  [OK] index IX_clinic_alta_requests_status_created_at")

# Helpful index for "pro user lookup by clinic" (rare but supports the ops
# clinic-detail page that lists who manages each clinic).
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_admin_users_clinic_id' AND object_id = OBJECT_ID('admin_users'))
    CREATE INDEX IX_admin_users_clinic_id ON admin_users(clinic_id) WHERE clinic_id IS NOT NULL
    """
)
print("  [OK] index IX_admin_users_clinic_id")

conn.commit()
cursor.close()
conn.close()
print("Migration complete.")
