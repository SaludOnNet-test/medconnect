#!/usr/bin/env python3
"""Add clinic_service_coverage table.

Powers the "which insurers cover which service at which clinic" matrix that
/aseguradoras and /search-v2 surface to the patient. Runs idempotently —
safe to re-run.

Coverage convention (single source of truth):
  - A row exists for (clinic_id, procedure_slug, insurance_name)
        → use the `covered` flag on that row.
  - No row                                 → treat as COVERED (default-on).
This means we don't have to populate every (clinic × procedure × insurer)
combination — the table only stores exceptions and ops-curated overrides.
The /aseguradoras stats endpoint reads `clinics.accepted_insurance` (the
broad clinic-level filter) until ops curates per-service exceptions.

Run:
    DB_PASSWORD=... python scripts/migration_add_clinic_service_coverage.py
"""

import os
import pymssql

print("Migration: add clinic_service_coverage table")

server = os.getenv('AZURE_SQL_SERVER', 'saludonai.database.windows.net')
database = os.getenv('AZURE_SQL_DATABASE', 'saludonai')
user = os.getenv('AZURE_SQL_USER', 'dbadmin')
password = os.getenv('DB_PASSWORD') or os.getenv('AZURE_SQL_PASSWORD')
if not password:
    raise SystemExit(
        'DB_PASSWORD (or AZURE_SQL_PASSWORD) env var is required. '
        'Re-run as: DB_PASSWORD=... python scripts/migration_add_clinic_service_coverage.py'
    )

conn = pymssql.connect(
    server=server, user=user, password=password, database=database,
    timeout=30, login_timeout=30,
)
cursor = conn.cursor()
print("[OK] Connected to Azure SQL")

print("Creating clinic_service_coverage table (if missing)...")
cursor.execute("""
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clinic_service_coverage')
    CREATE TABLE clinic_service_coverage (
        id INT IDENTITY PRIMARY KEY,
        clinic_id INT NOT NULL,
        procedure_slug NVARCHAR(255) NOT NULL,
        insurance_name NVARCHAR(120) NOT NULL,
        covered BIT NOT NULL DEFAULT 1,
        notes NVARCHAR(MAX) NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NULL,
        CONSTRAINT UQ_clinic_service_coverage UNIQUE (clinic_id, procedure_slug, insurance_name)
    )
""")
print("  [OK] clinic_service_coverage table ready")

cursor.execute("""
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_service_coverage_clinic_proc' AND object_id = OBJECT_ID('clinic_service_coverage'))
    CREATE INDEX IX_clinic_service_coverage_clinic_proc ON clinic_service_coverage(clinic_id, procedure_slug)
""")
print("  [OK] index IX_clinic_service_coverage_clinic_proc")

cursor.execute("""
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinic_service_coverage_insurance' AND object_id = OBJECT_ID('clinic_service_coverage'))
    CREATE INDEX IX_clinic_service_coverage_insurance ON clinic_service_coverage(insurance_name)
""")
print("  [OK] index IX_clinic_service_coverage_insurance")

# Sanity counters so the run output tells the user what to expect from the
# /aseguradoras stats endpoint after the migration.
cursor.execute("SELECT COUNT(*) FROM clinics")
total_clinics = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM clinic_procedures")
total_procedures = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM clinic_service_coverage")
existing_rows = cursor.fetchone()[0]

conn.commit()
cursor.close()
conn.close()

print(
    f"\nMigration complete. Defaults: {total_clinics} clinics × "
    f"{total_procedures} procedures × N insurers all covered by absence rule. "
    f"{existing_rows} explicit override row(s) in clinic_service_coverage."
)
print(
    "\nNext step: ops curates per-service exceptions by inserting rows with "
    "covered = 0. Until then the /aseguradoras page reads the broad "
    "clinics.accepted_insurance column for stats."
)
