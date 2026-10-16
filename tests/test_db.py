"""Schema versioning and persistence on disk."""
from __future__ import annotations

from app.db import SCHEMA_VERSION, Database


async def test_migrations_and_wal(tmp_path):
    path = tmp_path / "sub" / "partners.db"
    db = Database(path)
    await db.connect()
    try:
        assert await db.schema_version() == SCHEMA_VERSION
        row = await db.fetchone("PRAGMA journal_mode")
        assert row and list(row.values())[0] == "wal"
        pid = await db.create_program(
            {"name": "A", "category": "", "status": "active", "description": "", "website_url": "", "cabinet_url": "",
             "login": "", "payout_model": "", "payout_terms": "", "payout_min": "", "payout_method": "", "tags": ["t"],
             "notes": "", "favorite": False},
            [{"title": "", "url": "https://example.com", "promo_code": "", "note": ""}],
        )
    finally:
        await db.close()

    db2 = Database(path)
    await db2.connect()  # migrate() is idempotent
    try:
        assert await db2.schema_version() == SCHEMA_VERSION
        program = await db2.get_program(pid)
        assert program and program["tags"] == ["t"] and len(program["links"]) == 1
        assert (await db2.counts()) == {"programs": 1, "active": 1, "favorites": 0, "links": 1}
    finally:
        await db2.close()
