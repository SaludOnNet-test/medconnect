#!/usr/bin/env python3
"""Snapshot top clinics from Azure SQL into src/data/clinics-snapshot.json.

This snapshot replaces the legacy 6-row mock that search-v2 used as the
fallback before /api/clinics/search responded. Cards rendered from this
snapshot are real (just possibly stale). Re-run this script whenever the
catalogue meaningfully changes.

Output shape mirrors what /api/clinics/search returns so the search-v2 page
can drop it in without transformations.

Run:
    python scripts/snapshot_clinics_for_search.py
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pymssql

LIMIT = 50
OUT_PATH = Path(__file__).parent.parent / "src" / "data" / "clinics-snapshot.json"

# Same specialty mapping the search API uses, mirrored here so each snapshot
# clinic carries the same `specialtyIds` shape consumers expect.
SPECIALTY_SLUG_MAP = {
    1: ["traumatologia", "cirugia-ortopedica"],
    2: ["dermatologia"],
    3: ["ginecologia", "obstetricia"],
    4: ["oftalmologia"],
    5: ["cardiologia"],
    6: ["urologia"],
    7: ["otorrinolaringologia", "orl"],
    8: ["digestivo", "gastroenterologia"],
}


def slugs_to_specialty_ids(slugs):
    ids = set()
    for slug in slugs:
        lower = (slug or "").lower()
        for sid, keywords in SPECIALTY_SLUG_MAP.items():
            if any(kw in lower for kw in keywords):
                ids.add(sid)
    return sorted(ids)


def main() -> None:
    print(f"Snapshot: top {LIMIT} clinics → {OUT_PATH}")

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

    cur.execute(
        f"""
        SELECT TOP {LIMIT}
            c.id, c.name, c.city, c.province, c.address,
            c.rating, c.review_count, c.accepted_insurance, c.allows_free_cancel,
            c.latitude, c.longitude, c.description, c.telephone,
            c.small_picture_id, c.medium_picture_id, c.is_preferential
        FROM clinics c
        WHERE c.rating IS NOT NULL
        ORDER BY c.is_preferential DESC, c.rating DESC, c.review_count DESC, c.name ASC
        """
    )
    rows = cur.fetchall()
    clinic_ids = [r["id"] for r in rows]

    specialties_by_clinic: dict[int, list[str]] = {}
    if clinic_ids:
        id_list = ",".join(str(i) for i in clinic_ids)
        cur.execute(
            f"SELECT clinic_id, specialty_slug FROM clinic_specialties WHERE clinic_id IN ({id_list})"
        )
        for row in cur.fetchall():
            specialties_by_clinic.setdefault(row["clinic_id"], []).append(row["specialty_slug"])

    clinics = []
    for c in rows:
        clinics.append({
            "id": c["id"],
            "name": c["name"],
            "city": c["city"] or "",
            "province": c["province"] or "",
            "address": c["address"] or "",
            "rating": float(c["rating"]) if c["rating"] is not None else 4.2,
            "reviewCount": c["review_count"] or 0,
            "acceptedInsurance": (
                [s.strip() for s in c["accepted_insurance"].split(",") if s.strip()]
                if c["accepted_insurance"]
                else ["Sin seguro - SaludOnNet"]
            ),
            "allowsFreeCancel": bool(c["allows_free_cancel"]),
            "specialtyIds": slugs_to_specialty_ids(specialties_by_clinic.get(c["id"], [])),
            "lat": float(c["latitude"]) if c["latitude"] is not None else None,
            "lng": float(c["longitude"]) if c["longitude"] is not None else None,
            "description": c["description"],
            "telephone": c["telephone"],
            "smallPictureId": c["small_picture_id"],
            "mediumPictureId": c["medium_picture_id"],
            "isPreferential": bool(c["is_preferential"]),
            "hasRealSchedule": True,
        })

    cur.close()
    conn.close()

    payload = {
        "_meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": len(clinics),
            "source": "scripts/snapshot_clinics_for_search.py",
            "note": (
                "First-paint fallback for /search-v2. Real but possibly stale; "
                "re-run the script to refresh."
            ),
        },
        "clinics": clinics,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] Wrote {len(clinics)} clinics to {OUT_PATH.relative_to(Path.cwd()) if OUT_PATH.is_relative_to(Path.cwd()) else OUT_PATH}")


if __name__ == "__main__":
    main()
