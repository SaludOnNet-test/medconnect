#!/usr/bin/env python3
"""Add procedure + voucher columns to bookings, create vouchers table.

Idempotent: checks before adding each column / creating the table so it can be
run repeatedly. Safe to apply on a live DB (uses ALTER TABLE).

Run:
    python scripts/migration_add_voucher_columns.py
"""

import os
import pymssql

print("Migration: add voucher columns to bookings + create vouchers table")

server = 'saludonai.database.windows.net'
database = 'saludonai'
user = 'dbadmin'
password = os.getenv('DB_PASSWORD', ';rMiE43c3$GNHhL')

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


# 1. Bookings — extra columns to record what was sold (procedure + price split).
print("Updating bookings table...")
add_column_if_missing("bookings", "procedure_slug", "NVARCHAR(100) NULL")
add_column_if_missing("bookings", "procedure_name", "NVARCHAR(255) NULL")
add_column_if_missing("bookings", "service_price", "DECIMAL(10,2) NULL")
add_column_if_missing("bookings", "platform_fee", "DECIMAL(10,2) NULL")

# 2. Vouchers — one row per sin-seguro booking, tracks SON voucher delivery.
print("Creating vouchers table (if missing)...")
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'vouchers')
    CREATE TABLE vouchers (
        id INT IDENTITY PRIMARY KEY,
        booking_id NVARCHAR(50) NOT NULL,
        voucher_url NVARCHAR(500) NULL,
        voucher_pdf_path NVARCHAR(500) NULL,
        son_order_ref NVARCHAR(100) NULL,
        status NVARCHAR(40) NOT NULL DEFAULT 'awaiting_voucher',
        uploaded_by NVARCHAR(100) NULL,
        uploaded_at DATETIMEOFFSET NULL,
        sent_to_patient_at DATETIMEOFFSET NULL,
        redeemed_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT FK_vouchers_bookings FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
    """
)
print("  [OK] vouchers table ready")

# Helpful index for ops dashboard queries (filter by status + age).
cursor.execute(
    """
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_vouchers_status_created_at' AND object_id = OBJECT_ID('vouchers'))
    CREATE INDEX IX_vouchers_status_created_at ON vouchers(status, created_at DESC)
    """
)
print("  [OK] index IX_vouchers_status_created_at")

conn.commit()
cursor.close()
conn.close()
print("Migration complete.")
