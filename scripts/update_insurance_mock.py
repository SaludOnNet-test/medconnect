#!/usr/bin/env python3
"""
Mock: set accepted_insurance for ALL clinics to the full list of insurance companies.
Uses pyodbc (TLS 1.2) for Azure SQL.
"""
import pyodbc

AZ_CONN_STR = (
    "DRIVER={SQL Server};"
    "SERVER=saludonai.database.windows.net,1433;"
    "DATABASE=saludonai;"
    "UID=dbadmin;"
    "PWD={;rMiE43c3$GNHhL};"
    "Encrypt=yes;"
)

ALL_INSURANCE = "Sanitas,Adeslas,DKV,AXA,Mapfre,Asisa,Cigna,Generali,Caser,Néctar,Sin seguro - SaludOnNet"

print("Connecting to Azure SQL...")
az = pyodbc.connect(AZ_CONN_STR, timeout=30)
cur = az.cursor()

cur.execute("SELECT COUNT(*) FROM clinics")
total = cur.fetchone()[0]
print(f"  Clinics in DB: {total:,}")

cur.execute("UPDATE clinics SET accepted_insurance = ?", (ALL_INSURANCE,))
updated = cur.rowcount
az.commit()
az.close()

print(f"  Updated: {updated:,} rows")
print(f"  accepted_insurance set to all {len(ALL_INSURANCE.split(','))} companies")
print("Done.")
