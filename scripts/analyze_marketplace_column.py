#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Analyze PublicadoMarketplace column in Excel
"""

import pandas as pd
from pathlib import Path

project_root = Path(__file__).parent.parent
excel_file = project_root / "Cuadro Medico SON - 170426.xlsx"

print("\n" + "=" * 80)
print("ANALYSIS: PublicadoMarketplace Column")
print("=" * 80)

try:
    df = pd.read_excel(excel_file, sheet_name="Sheet1")
    print(f"\nTotal rows in Excel: {len(df):,}")
    print(f"Columns: {list(df.columns)}")

    # Check PublicadoMarketplace column
    if 'PublicadoMarketplace' in df.columns:
        print(f"\n[COLUMN] PublicadoMarketplace")
        print(f"  Data type: {df['PublicadoMarketplace'].dtype}")
        print(f"  Unique values: {df['PublicadoMarketplace'].unique()}")
        print(f"  Value counts:")
        print(df['PublicadoMarketplace'].value_counts())

        # Count published (Sí, 1, True, etc.)
        published_df = df[
            (df['PublicadoMarketplace'].astype(str).str.lower().isin(['sí', '1', 'true', 's', 'yes', '1.0']))
        ]
        print(f"\n  Published (Sí/1/True): {len(published_df):,}")
        print(f"  Not published: {len(df) - len(published_df):,}")

        if len(published_df) > 0:
            print(f"\n  Sample published clinics:")
            for idx, row in published_df.head(10).iterrows():
                clon = row['IdClon'] if 'IdClon' in row else '?'
                name = row.get('Proveedor', '?')[:50]
                print(f"    clon-{clon}: {name}")

    else:
        print(f"  ERROR: PublicadoMarketplace column not found")

except Exception as e:
    print(f"ERROR: {e}")

print("\nDone.")
