#!/usr/bin/env python3
"""Geocode clinics that are missing latitude/longitude.

The /search-v2 map filters clinics where `lat && lng` is truthy. ~2,100 of
~3,135 rows in `clinics` are missing coords today, so most don't appear on
the map even when they show in the list.

Strategy: hit Nominatim (OpenStreetMap) for every clinic with an address
but no coords. Fall back to city centroid if the full address doesn't
resolve. Update the row in place. Idempotent — only touches rows where
latitude IS NULL OR longitude IS NULL, so safe to re-run.

Rate limit: Nominatim's public service requires <= 1 req/sec and a
descriptive User-Agent. We honour both.

Usage:
    python scripts/geocode_missing_clinic_coords.py            # whole DB
    python scripts/geocode_missing_clinic_coords.py --limit 10 # try 10
    python scripts/geocode_missing_clinic_coords.py --city "Alcala de Henares"
    python scripts/geocode_missing_clinic_coords.py --dry-run  # no UPDATE

You can stop with Ctrl-C — already-updated rows persist (commits every batch).
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from typing import Optional

import pymssql

USER_AGENT = "MedConnect-clinic-geocoder/1.0 (operaciones@medconnect.es)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
RATE_LIMIT_SECONDS = 1.0  # public Nominatim policy
COMMIT_EVERY = 25         # checkpoint progress to DB


def geocode(query: str) -> Optional[tuple[float, float]]:
    """Return (lat, lng) for a free-form address string, or None."""
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": "1",
        "countrycodes": "es",  # restrict to Spain
        "addressdetails": "0",
    })
    url = f"{NOMINATIM_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  ! geocode error for {query!r}: {e}", file=sys.stderr)
        return None
    if not data:
        return None
    try:
        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
        return (lat, lng)
    except (KeyError, ValueError, TypeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="max rows (0 = all)")
    parser.add_argument("--city", type=str, default=None, help="restrict to a city (substring match, accent-insensitive)")
    parser.add_argument("--dry-run", action="store_true", help="don't UPDATE, just print what would happen")
    args = parser.parse_args()

    server = "saludonai.database.windows.net"
    database = "saludonai"
    user = "dbadmin"
    password = os.getenv("DB_PASSWORD", ";rMiE43c3$GNHhL")

    conn = pymssql.connect(
        server=server, user=user, password=password, database=database,
        timeout=30, login_timeout=30,
    )
    cur = conn.cursor(as_dict=True)
    print("[OK] Connected to Azure SQL")

    sql = """
        SELECT id, name, address, city, province
        FROM clinics
        WHERE (latitude IS NULL OR longitude IS NULL)
          AND address IS NOT NULL AND address <> ''
    """
    params = []
    if args.city:
        sql += " AND city COLLATE Latin1_General_CI_AI LIKE %s"
        params.append(f"%{args.city}%")
    sql += " ORDER BY id"
    if args.limit > 0:
        sql = sql.replace("SELECT id,", f"SELECT TOP {args.limit} id,")

    cur.execute(sql, tuple(params) if params else None)
    rows = cur.fetchall()
    total = len(rows)
    print(f"[INFO] {total} clinics to geocode (dry_run={args.dry_run})")
    if total == 0:
        cur.close(); conn.close()
        return

    success_address = 0
    success_city = 0
    failed = 0
    pending_updates: list[tuple[float, float, int]] = []
    last_request_ts = 0.0

    for i, r in enumerate(rows, start=1):
        clinic_id = r["id"]
        addr = (r["address"] or "").strip()
        city = (r["city"] or "").strip()
        prov = (r["province"] or "").strip()

        # Throttle to <= 1 req/sec
        elapsed = time.monotonic() - last_request_ts
        if elapsed < RATE_LIMIT_SECONDS:
            time.sleep(RATE_LIMIT_SECONDS - elapsed)

        # Try address + city first
        full_query = ", ".join(p for p in (addr, city, prov, "España") if p)
        coords = geocode(full_query)
        last_request_ts = time.monotonic()
        source = "address"

        # Fallback to city centroid if address didn't resolve
        if coords is None and city:
            time.sleep(RATE_LIMIT_SECONDS)
            coords = geocode(", ".join(p for p in (city, prov, "España") if p))
            last_request_ts = time.monotonic()
            source = "city"

        if coords is None:
            failed += 1
            print(f"  [{i}/{total}] id={clinic_id} ({r['name'][:40]}) — NOT FOUND  ({addr or 'no addr'} / {city})")
            continue

        if source == "address":
            success_address += 1
        else:
            success_city += 1

        lat, lng = coords
        print(f"  [{i}/{total}] id={clinic_id} ({r['name'][:40]:40}) {source:7} {lat:.5f}, {lng:.5f}")

        if not args.dry_run:
            pending_updates.append((lat, lng, clinic_id))
            # Commit every COMMIT_EVERY rows so a Ctrl-C doesn't lose much.
            if len(pending_updates) >= COMMIT_EVERY:
                cur.executemany(
                    "UPDATE clinics SET latitude=%s, longitude=%s, updated_at=SYSDATETIMEOFFSET() WHERE id=%s",
                    pending_updates,
                )
                conn.commit()
                pending_updates.clear()

    # Final flush
    if pending_updates and not args.dry_run:
        cur.executemany(
            "UPDATE clinics SET latitude=%s, longitude=%s, updated_at=SYSDATETIMEOFFSET() WHERE id=%s",
            pending_updates,
        )
        conn.commit()

    cur.close(); conn.close()

    print()
    print("=== Summary ===")
    print(f"  Resolved via address: {success_address}")
    print(f"  Fallback to city:     {success_city}")
    print(f"  Not found:            {failed}")
    print(f"  Total processed:      {total}")
    if args.dry_run:
        print("(dry-run — nothing was written)")


if __name__ == "__main__":
    main()
