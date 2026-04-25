#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Import SON Clinics from Excel directly (NOT from SON DB)

Filters by: PublicadoMarketplace = 'SI'
Source: Cuadro Medico SON - 170426.xlsx
Target: Azure SQL clinics table

This is the FIX for the bug where import_son_clinics.py
imports from SON DB (incomplete) instead of Excel.

Goal: Reach 2,960 clinics in DB.
"""

import pandas as pd
import pyodbc
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

AZ_CONN_STR = (
    "DRIVER={SQL Server};"
    "SERVER=saludonai.database.windows.net,1433;"
    "DATABASE=saludonai;"
    "UID=dbadmin;"
    "PWD={;rMiE43c3$GNHhL};"
    "Encrypt=yes;"
)

project_root = Path(__file__).parent.parent
excel_file = project_root / "Cuadro Medico SON - 170426.xlsx"

print("\n" + "=" * 80)
print("IMPORT SON CLINICS FROM EXCEL (PublicadoMarketplace = SI)")
print("=" * 80)

# STEP 1: Read Excel
print("\n[STEP 1] Reading Excel...")
df = pd.read_excel(excel_file, sheet_name="Sheet1")
print(f"  Total rows: {len(df):,}")

# STEP 2: Filter published
print("\n[STEP 2] Filtering PublicadoMarketplace = 'SI'...")
published = df[df['PublicadoMarketplace'].astype(str).str.upper() == 'SI'].copy()
print(f"  Published: {len(published):,}")

# STEP 3: Parse and validate
print("\n[STEP 3] Parsing clinic records...")
providers = []
skipped = 0

for idx, row in published.iterrows():
    try:
        id_clon = int(row['IdClon']) if not pd.isna(row['IdClon']) else None
        if not id_clon:
            skipped += 1
            continue

        name = str(row['Proveedor']).strip()[:255] if not pd.isna(row['Proveedor']) else None
        if not name:
            skipped += 1
            continue

        province = str(row['Provincia']).strip()[:100] if not pd.isna(row.get('Provincia')) else None
        city = str(row['Localidad']).strip()[:100] if not pd.isna(row.get('Localidad')) else None
        address = str(row['Direccion']).strip()[:500] if not pd.isna(row.get('Direccion')) else None
        postal = str(row['CodigoPostal']).strip()[:20] if not pd.isna(row.get('CodigoPostal')) else None

        providers.append({
            'id': id_clon,
            'son_id': id_clon,
            'name': name,
            'province': province,
            'city': city,
            'address': address,
            'postal_code': postal,
        })
    except Exception as e:
        skipped += 1
        if skipped <= 5:
            print(f"  Skipped row {idx}: {e}")

print(f"  Valid: {len(providers):,}")
print(f"  Skipped: {skipped}")

# STEP 4: Connect to Azure SQL
print("\n[STEP 4] Connecting to Azure SQL...")
az = pyodbc.connect(AZ_CONN_STR, timeout=30)
cur = az.cursor()

cur.execute("SELECT id FROM clinics")
existing_ids = {row[0] for row in cur.fetchall()}
print(f"  Existing in DB: {len(existing_ids):,}")

# STEP 5: Upsert
print("\n[STEP 5] Upserting...")
inserted = 0
updated = 0
errors = 0

for p in providers:
    try:
        if p['id'] in existing_ids:
            cur.execute("""
                UPDATE clinics SET
                    son_id = ?,
                    name = ?,
                    province = ?,
                    city = ?,
                    address = ?,
                    postal_code = ?,
                    updated_at = SYSDATETIMEOFFSET()
                WHERE id = ?
            """, (
                p['son_id'], p['name'], p['province'], p['city'],
                p['address'], p['postal_code'], p['id'],
            ))
            updated += 1
        else:
            cur.execute("""
                INSERT INTO clinics
                    (id, son_id, name, province, city, address, postal_code,
                     review_count, allows_free_cancel, is_preferential,
                     created_at, updated_at)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?,
                     0, 0, 0,
                     SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
            """, (
                p['id'], p['son_id'], p['name'], p['province'], p['city'],
                p['address'], p['postal_code'],
            ))
            inserted += 1

        if (inserted + updated) % 200 == 0:
            az.commit()
            print(f"  Progress: {inserted} inserted, {updated} updated...")

    except Exception as e:
        errors += 1
        if errors <= 5:
            print(f"  Error on clinic {p['id']} ({p['name'][:30]}): {e}")

az.commit()

# STEP 6: Verify
cur.execute("SELECT COUNT(*) FROM clinics")
final_count = cur.fetchone()[0]
az.close()

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"  From Excel (published):  {len(providers):,}")
print(f"  Newly inserted:          {inserted:,}")
print(f"  Updated existing:        {updated:,}")
print(f"  Errors:                  {errors:,}")
print(f"  Total in DB AFTER:       {final_count:,}")
print(f"  Target (Marketplace SI): 2,960")

if final_count >= 2960:
    print(f"\n  STATUS: SUCCESS - Reached target!")
else:
    print(f"\n  STATUS: SHORT BY {2960 - final_count:,}")

print("\nDone.")
