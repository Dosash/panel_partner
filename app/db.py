"""SQLite storage of the partner programs and their links (aiosqlite, WAL).

Schema versions are tracked with ``PRAGMA user_version``; `Database.migrate()` runs at every start
and applies the missing steps in order. Timestamps are unix seconds (UTC). Tags are stored as a
JSON array in ``programs.tags_json``; the API works with plain lists.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import aiosqlite

SCHEMA_VERSION = 1

STATUS_ACTIVE = "active"
STATUS_PAUSED = "paused"
STATUS_ARCHIVED = "archived"
STATUSES = (STATUS_ACTIVE, STATUS_PAUSED, STATUS_ARCHIVED)

PAYOUT_MODELS = ("CPA", "RevShare", "CPL", "CPS", "Fix", "Гибрид", "Другое")

PROGRAM_TEXT_FIELDS = (
    "name", "category", "description", "website_url", "cabinet_url", "login",
    "payout_model", "payout_terms", "payout_min", "payout_method", "notes",
)
LINK_TEXT_FIELDS = ("title", "url", "promo_code", "note")

_MIGRATIONS: dict[int, list[str]] = {
    1: [
        """CREATE TABLE programs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            description TEXT NOT NULL DEFAULT '',
            website_url TEXT NOT NULL DEFAULT '',
            cabinet_url TEXT NOT NULL DEFAULT '',
            login TEXT NOT NULL DEFAULT '',
            payout_model TEXT NOT NULL DEFAULT '',
            payout_terms TEXT NOT NULL DEFAULT '',
            payout_min TEXT NOT NULL DEFAULT '',
            payout_method TEXT NOT NULL DEFAULT '',
            tags_json TEXT NOT NULL DEFAULT '[]',
            notes TEXT NOT NULL DEFAULT '',
            favorite INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )""",
        """CREATE TABLE links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL,
            promo_code TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            sort INTEGER NOT NULL DEFAULT 0
        )""",
        "CREATE INDEX idx_links_program ON links(program_id, sort, id)",
        "CREATE INDEX idx_programs_updated ON programs(updated_at DESC)",
    ],
}


def now() -> int:
    return int(time.time())


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        self._conn: aiosqlite.Connection | None = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("База данных не подключена")
        return self._conn

    async def connect(self) -> None:
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(self.path)
        self._conn.row_factory = aiosqlite.Row
        if self.path != ":memory:":
            await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA foreign_keys=ON")
        await self._conn.execute("PRAGMA busy_timeout=5000")
        await self.migrate()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    # ------------------------------------------------------------------ schema

    async def schema_version(self) -> int:
        cur = await self.conn.execute("PRAGMA user_version")
        row = await cur.fetchone()
        return int(row[0]) if row else 0

    async def migrate(self) -> None:
        version = await self.schema_version()
        for target in range(version + 1, SCHEMA_VERSION + 1):
            for statement in _MIGRATIONS[target]:
                await self.conn.execute(statement)
            await self.conn.execute(f"PRAGMA user_version={target}")
            await self.conn.commit()

    # ------------------------------------------------------------------ helpers

    async def fetchone(self, sql: str, params: tuple = ()) -> dict[str, Any] | None:
        cur = await self.conn.execute(sql, params)
        row = await cur.fetchone()
        return dict(row) if row else None

    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cur = await self.conn.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]

    @staticmethod
    def _program_row(row: dict[str, Any], links: list[dict[str, Any]]) -> dict[str, Any]:
        out = {k: v for k, v in row.items() if k != "tags_json"}
        try:
            tags = json.loads(row.get("tags_json") or "[]")
        except ValueError:
            tags = []
        out["tags"] = [t for t in tags if isinstance(t, str)]
        out["favorite"] = bool(row.get("favorite"))
        out["links"] = links
        return out

    # ------------------------------------------------------------------ programs

    async def list_programs(self) -> list[dict[str, Any]]:
        rows = await self.fetchall("SELECT * FROM programs ORDER BY favorite DESC, updated_at DESC, id DESC")
        links = await self.fetchall("SELECT * FROM links ORDER BY program_id, sort, id")
        by_program: dict[int, list[dict[str, Any]]] = {}
        for link in links:
            by_program.setdefault(int(link["program_id"]), []).append(link)
        return [self._program_row(r, by_program.get(int(r["id"]), [])) for r in rows]

    async def get_program(self, program_id: int) -> dict[str, Any] | None:
        row = await self.fetchone("SELECT * FROM programs WHERE id = ?", (program_id,))
        if row is None:
            return None
        links = await self.fetchall("SELECT * FROM links WHERE program_id = ? ORDER BY sort, id", (program_id,))
        return self._program_row(row, links)

    async def _write_links(self, program_id: int, links: list[dict[str, Any]]) -> None:
        await self.conn.execute("DELETE FROM links WHERE program_id = ?", (program_id,))
        for sort, link in enumerate(links):
            await self.conn.execute(
                "INSERT INTO links (program_id, title, url, promo_code, note, sort) VALUES (?, ?, ?, ?, ?, ?)",
                (program_id, link["title"], link["url"], link["promo_code"], link["note"], sort),
            )

    async def create_program(self, data: dict[str, Any], links: list[dict[str, Any]], *,
                             ts: int | None = None) -> int:
        """`data` and `links` are already validated (see app.programs)."""
        current = ts if ts is not None else now()
        created = int(data.get("created_at") or current)
        updated = int(data.get("updated_at") or current)
        cur = await self.conn.execute(
            "INSERT INTO programs (name, category, status, description, website_url, cabinet_url, login, "
            "payout_model, payout_terms, payout_min, payout_method, tags_json, notes, favorite, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (data["name"], data["category"], data["status"], data["description"], data["website_url"],
             data["cabinet_url"], data["login"], data["payout_model"], data["payout_terms"], data["payout_min"],
             data["payout_method"], json.dumps(data["tags"], ensure_ascii=False), data["notes"],
             1 if data["favorite"] else 0, created, updated),
        )
        program_id = int(cur.lastrowid)
        await self._write_links(program_id, links)
        await self.conn.commit()
        return program_id

    async def replace_program(self, program_id: int, data: dict[str, Any], links: list[dict[str, Any]]) -> bool:
        cur = await self.conn.execute(
            "UPDATE programs SET name=?, category=?, status=?, description=?, website_url=?, cabinet_url=?, login=?, "
            "payout_model=?, payout_terms=?, payout_min=?, payout_method=?, tags_json=?, notes=?, favorite=?, "
            "updated_at=? WHERE id=?",
            (data["name"], data["category"], data["status"], data["description"], data["website_url"],
             data["cabinet_url"], data["login"], data["payout_model"], data["payout_terms"], data["payout_min"],
             data["payout_method"], json.dumps(data["tags"], ensure_ascii=False), data["notes"],
             1 if data["favorite"] else 0, now(), program_id),
        )
        if cur.rowcount == 0:
            return False
        await self._write_links(program_id, links)
        await self.conn.commit()
        return True

    async def patch_program(self, program_id: int, fields: dict[str, Any]) -> bool:
        """Partial update of scalar columns (``favorite`` / ``status``); `fields` is validated."""
        if not fields:
            return await self.fetchone("SELECT 1 FROM programs WHERE id = ?", (program_id,)) is not None
        sets = []
        params: list[Any] = []
        for key, value in fields.items():
            sets.append(f"{key} = ?")
            params.append(1 if value is True else 0 if value is False else value)
        sets.append("updated_at = ?")
        params.extend([now(), program_id])
        cur = await self.conn.execute(f"UPDATE programs SET {', '.join(sets)} WHERE id = ?", tuple(params))
        await self.conn.commit()
        return cur.rowcount > 0

    async def delete_program(self, program_id: int) -> bool:
        cur = await self.conn.execute("DELETE FROM programs WHERE id = ?", (program_id,))
        await self.conn.commit()
        return cur.rowcount > 0

    async def counts(self) -> dict[str, int]:
        row = await self.fetchone(
            "SELECT (SELECT COUNT(*) FROM programs) AS programs, "
            "(SELECT COUNT(*) FROM programs WHERE status = ?) AS active, "
            "(SELECT COUNT(*) FROM programs WHERE favorite = 1) AS favorites, "
            "(SELECT COUNT(*) FROM links) AS links",
            (STATUS_ACTIVE,),
        ) or {}
        return {k: int(row.get(k) or 0) for k in ("programs", "active", "favorites", "links")}

    async def categories(self) -> list[str]:
        rows = await self.fetchall(
            "SELECT category FROM programs WHERE category <> '' GROUP BY category ORDER BY LOWER(category)"
        )
        return [r["category"] for r in rows]

    async def tags(self) -> list[str]:
        rows = await self.fetchall("SELECT tags_json FROM programs")
        seen: set[str] = set()
        for r in rows:
            try:
                for tag in json.loads(r["tags_json"] or "[]"):
                    if isinstance(tag, str) and tag:
                        seen.add(tag)
            except ValueError:
                continue
        return sorted(seen, key=str.casefold)
