#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compare SON Excel file vs MedConnect DB

Reads Excel: "Cuadro Medico SON - 170426.xlsx"
Compares with: Azure SQL clinics table
"""

import pandas as pd
import pyodbc
import sys
from pathlib import Path

# Force UTF-8
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
print("COMPARISON: SON EXCEL vs MedConnect DB")
print("=" * 80)

# STEP 1: Read Excel
print("\n[STEP 1] Reading SON Excel file...")
print(f"  File: {excel_file}")

if not excel_file.exists():
    print(f"  ERROR: File not found: {excel_file}")
    exit(1)

try:
    excel_sheets = pd.read_excel(excel_file, sheet_name=None)
    print(f"  OK: Sheets in Excel: {list(excel_sheets.keys())}")

    df = None
    for sheet_name in ["Cuadro Medico", "Data", "Clinicas", "Providers", "Sheet1"]:
        if sheet_name in excel_sheets:
            df = excel_sheets[sheet_name]
            print(f"  OK: Using sheet: '{sheet_name}'")
            break

    if df is None:
        sheet_name = list(excel_sheets.keys())[0]
        df = excel_sheets[sheet_name]
        print(f"  OK: Using sheet (first): '{sheet_name}'")

    print(f"  OK: Total rows in Excel: {len(df)}")
    print(f"  OK: Columns: {list(df.columns)[:10]}...")

except Exception as e:
    print(f"  ERROR: {e}")
    exit(1)

# STEP 2: Connect to DB
print("\n[STEP 2] Reading MedConnect database...")

try:
    az = pyodbc.connect(AZ_CONN_STR, timeout=30)
    cur = az.cursor()
    cur.execute("SELECT id, name FROM clinics ORDER BY id")
    db_clinics = {row[0]: row[1] for row in cur.fetchall()}
    print(f"  OK: Total clinics in DB: {len(db_clinics):,}")
    az.close()

except Exception as e:
    print(f"  ERROR: {e}")
    exit(1)

# STEP 3: Find ID column
print("\n[STEP 3] Analyzing Excel structure...")

id_col = None
for col in df.columns:
    if 'idclon' in str(col).lower() or 'providerid' in str(col).lower() or 'clon' in str(col).lower():
        id_col = col
        break

if not id_col:
    print(f"  WARN: Could not find ID column")
    print(f"  Columns: {list(df.columns)}")
    exit(1)

print(f"  OK: ID column: '{id_col}'")

# STEP 4: Extract clinic IDs
print("\n[STEP 4] Extracting clinic IDs from Excel...")

excel_ids = set()

for idx, row in df.iterrows():
    val = row[id_col]
    if pd.isna(val):
        continue

    val_str = str(val).strip()
    try:
        if 'clon-' in val_str.lower():
            clinic_id = int(val_str.replace('clon-', '').replace('CLON-', ''))
        else:
            clinic_id = int(val_str)
        excel_ids.add(clinic_id)
    except:
        pass

print(f"  OK: Total clinic IDs in Excel: {len(excel_ids):,}")

# STEP 5: Compare
print("\n[STEP 5] COMPARISON RESULTS")
print("=" * 80)

db_ids = set(db_clinics.keys())

in_excel_not_db = excel_ids - db_ids
in_db_not_excel = db_ids - excel_ids
in_both = excel_ids & db_ids

print(f"\nTotal in Excel:        {len(excel_ids):,}")
print(f"Total in DB:           {len(db_ids):,}")
print(f"In BOTH:               {len(in_both):,}")
print(f"In Excel BUT NOT DB:   {len(in_excel_not_db):,} [MISSING]")
print(f"In DB BUT NOT Excel:   {len(in_db_not_excel):,} [EXTRA]")

# STEP 6: Sample missing
print("\n[STEP 6] SAMPLE MISSING CLINICS (first 30):")

missing_list = sorted(list(in_excel_not_db))[:30]
if missing_list:
    for cid in missing_list:
        print(f"  clon-{cid}")
else:
    print("  (none)")

# STEP 7: Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

if len(in_excel_not_db) == 0:
    print("OK: ALL Excel clinics are in the DB!")
else:
    print(f"PROBLEM: {len(in_excel_not_db):,} clinics in Excel but NOT in DB")
    print(f"\nCause: import_son_clinics.py or DB filters")
    print(f"Action: Re-run import script or check filters")

if len(in_db_not_excel) > 0:
    print(f"\nNote: {len(in_db_not_excel):,} clinics in DB but NOT in current Excel")
    print(f"(These might be from older Excel or manual imports)")

print("\nDone.")
