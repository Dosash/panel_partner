"""Configuration from the environment / .env file."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

_PREFIX_SEGMENT = re.compile(r"[A-Za-z0-9._~-]+")


def normalize_prefix(value: str | None) -> str:
    """``'partners'``, ``'/partners/'`` → ``'/partners'``; empty → ``''``."""
    parts = [p for p in (value or "").strip().split("/") if p]
    for part in parts:
        if part in (".", "..") or not _PREFIX_SEGMENT.fullmatch(part):
            raise ValueError(f"WEB_PREFIX: недопустимый сегмент пути {part!r}")
    return "/" + "/".join(parts) if parts else ""


@dataclass(frozen=True)
class Config:
    web_host: str = "127.0.0.1"
    web_port: int = 8097
    web_prefix: str = ""
    db_path: str = str(BASE_DIR / "data" / "partners.db")
    hub_url: str = ""


def load_config() -> Config:
    load_dotenv(BASE_DIR / ".env")
    port = os.getenv("WEB_PORT", "8097").strip()
    if not port.isdigit() or not 0 < int(port) < 65536:
        raise ValueError("WEB_PORT должен быть числом от 1 до 65535")
    return Config(
        web_host=os.getenv("WEB_HOST", "127.0.0.1").strip() or "127.0.0.1",
        web_port=int(port),
        web_prefix=normalize_prefix(os.getenv("WEB_PREFIX", "")),
        db_path=os.getenv("DB_PATH", "").strip() or Config.db_path,
        hub_url=os.getenv("HUB_URL", "").strip(),
    )
