#!/usr/bin/env python3
"""
Match Doctoralia Excel doctors → SON clinics (by province + fuzzy name),
then aggregate and upsert into clinic_schedules table.

Matching threshold: SequenceMatcher ratio >= 0.75 within same province.
Uses pyodbc (TLS 1.2) for Azure SQL.
"""
import unicodedata
import re
import pandas as pd
import pyodbc
from difflib import SequenceMatcher
from collections import defaultdict

AZ_CONN_STR = (
    "DRIVER={SQL Server};"
    "SERVER=saludonai.database.windows.net,1433;"
    "DATABASE=saludonai;"
    "UID=dbadmin;"
    "PWD={;rMiE43c3$GNHhL};"
    "Encrypt=yes;"
)

THRESHOLD = 0.75
EXCEL_PATH = "doctoralia_medicos-6.xlsx"

GENERIC_CLINIC_NAMES = {
    'pago online', 'consulta online', 'consultorio privado',
    'consulta privada', 'sobre la direccion', 'sin clinica',
}

REMOVE_WORDS = re.compile(
    r'\b(centro medico|centro|clinica|clinicas|medico|medica|de|la|el|los|las|y|s\.?l\.?|s\.?a\.?)\b'
)

def normalize(s):
    if not s:
        return ''
    s = str(s).lower().strip()
    # remove accents
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    # remove common clinic words
    s = REMOVE_WORDS.sub(' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def normalize_province(s):
    if not s:
        return ''
    s = str(s).lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    for prefix in ('comunidad de ', 'comunitat ', 'comunidad foral de ', 'provincia de ', 'region de '):
        s = s.replace(prefix, '')
    return s.strip()

def similarity(a, b):
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()

def parse_time(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s in ('', 'NaN', 'None', 'nan'):
        return None
    # handle datetime objects like "1900-01-01 09:00:00"
    if ' ' in s:
        s = s.split(' ')[-1]
    # ensure HH:MM format
    parts = s.split(':')
    if len(parts) >= 2:
        return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
    return None

# ── Load clinics from DB ─────────────────────────────────────────────────────
print("Connecting to Azure SQL...")
az = pyodbc.connect(AZ_CONN_STR, timeout=30)
cur = az.cursor()

cur.execute("SELECT id, name, province FROM clinics")
db_clinics = [{'id': r[0], 'name': r[1], 'province': r[2]} for r in cur.fetchall()]
print(f"  Loaded {len(db_clinics):,} clinics from DB")

# Index by normalized province for fast lookup
clinics_by_province = defaultdict(list)
for c in db_clinics:
    clinics_by_province[normalize_province(c['province'])].append(c)

# ── Read Doctoralia Excel ────────────────────────────────────────────────────
print(f"\nReading {EXCEL_PATH}...")
df = pd.read_excel(EXCEL_PATH, sheet_name="Médicos", header=None)
df = df.iloc[1:].copy()  # skip merged header row
df.columns = [
    'doctor_name', 'clinic_name', 'address', 'specialty', 'province',
    'lunes_inicio', 'lunes_fin',
    'martes_inicio', 'martes_fin',
    'miercoles_inicio', 'miercoles_fin',
    'jueves_inicio', 'jueves_fin',
    'viernes_inicio', 'viernes_fin',
]

# Filter out generic / non-clinic entries
df = df[~df['clinic_name'].str.strip().str.lower().isin(GENERIC_CLINIC_NAMES)]
df = df[df['address'].notna()]

# Keep only rows with at least one schedule
DAY_COLS = [('lunes', 0), ('martes', 1), ('miercoles', 2), ('jueves', 3), ('viernes', 4)]

def has_any_schedule(row):
    for day, _ in DAY_COLS:
        s = parse_time(row[f'{day}_inicio'])
        e = parse_time(row[f'{day}_fin'])
        if s and e:
            return True
    return False

df = df[df.apply(has_any_schedule, axis=1)]
print(f"  Viable rows after filtering: {len(df):,}")

# ── Match each row to a DB clinic ────────────────────────────────────────────
print("\nMatching Doctoralia rows to DB clinics...")

# For each row: {clinic_id → {day_of_week → (min_start, max_end)}}
# We union all doctors' schedules for the same clinic per day
clinic_day_ranges = defaultdict(lambda: defaultdict(lambda: [None, None]))

matched_rows = 0
unmatched_rows = 0
seen_pairs = {}  # (clinic_id, day) already updated

for _, row in df.iterrows():
    doc_clinic = str(row['clinic_name']).strip()
    doc_province = normalize_province(str(row['province']))

    # Look up candidates in same province
    candidates = clinics_by_province.get(doc_province, [])
    if not candidates:
        unmatched_rows += 1
        continue

    # Find best match by name similarity
    best_id, best_score = None, 0.0
    for c in candidates:
        score = similarity(doc_clinic, c['name'])
        if score > best_score:
            best_score, best_id = score, c['id']

    if best_score < THRESHOLD:
        unmatched_rows += 1
        continue

    matched_rows += 1

    # Aggregate schedules: extend the time range per day
    for day_name, day_num in DAY_COLS:
        start = parse_time(row[f'{day_name}_inicio'])
        end   = parse_time(row[f'{day_name}_fin'])
        if not start or not end:
            continue
        current = clinic_day_ranges[best_id][day_num]
        # union: take earliest start, latest end
        current[0] = min(current[0], start) if current[0] else start
        current[1] = max(current[1], end)   if current[1] else end

print(f"  Matched: {matched_rows:,}  |  Unmatched: {unmatched_rows:,}")
print(f"  Clinics with real schedules: {len(clinic_day_ranges):,}")

# ── Upsert into clinic_schedules ─────────────────────────────────────────────
print("\nUpserting clinic_schedules...")

total_deleted = 0
total_inserted = 0
errors = 0

for clinic_id, day_map in clinic_day_ranges.items():
    try:
        cur.execute("DELETE FROM clinic_schedules WHERE clinic_id = ?", (clinic_id,))
        total_deleted += cur.rowcount

        for day_num, (start, end) in day_map.items():
            if start and end:
                cur.execute(
                    "INSERT INTO clinic_schedules (clinic_id, day_of_week, start_time, end_time, is_available, source) "
                    "VALUES (?, ?, ?, ?, 1, 'doctoralia')",
                    (clinic_id, day_num, start, end)
                )
                total_inserted += 1
    except Exception as e:
        errors += 1
        if errors <= 5:
            print(f"  Error clinic {clinic_id}: {e}")

az.commit()
az.close()

print(f"\n=== Summary ===")
print(f"  Rows read from Excel:     {len(df):,}")
print(f"  Rows matched to DB:       {matched_rows:,}")
print(f"  Rows unmatched:           {unmatched_rows:,}")
print(f"  Clinics with schedules:   {len(clinic_day_ranges):,}")
print(f"  Schedule rows deleted:    {total_deleted:,}")
print(f"  Schedule rows inserted:   {total_inserted:,}")
print(f"  Errors:                   {errors}")
print("Done.")
