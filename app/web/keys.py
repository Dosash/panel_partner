"""Typed keys for objects stored in the aiohttp application (`app[KEY]`)."""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

from app.config import Config
from app.db import Database

if TYPE_CHECKING:
    from app.auth import LoginGuard

DB_KEY: web.AppKey[Database] = web.AppKey("db", Database)
CONFIG_KEY: web.AppKey[Config] = web.AppKey("config", Config)
# URL prefix of the panel (normalized WEB_PREFIX: '' or '/partners').
PREFIX_KEY: web.AppKey[str] = web.AppKey("prefix", str)
# Directory with index.html, app.js, style.css.
STATIC_DIR_KEY: web.AppKey[Path] = web.AppKey("static_dir", Path)
# In-memory brute-force guard of the login endpoint (see app.auth.LoginGuard).
LOGIN_GUARD_KEY: web.AppKey[LoginGuard] = web.AppKey("login_guard")
