"""Web panel: aiohttp application serving the SPA (`app/web/static/`) and the JSON API (`/api`).

    create_web_app(db, config) -> aiohttp.web.Application

Everything is served under ``config.web_prefix`` (``WEB_PREFIX``, '' by default): ``<prefix>/``
returns `static/index.html` with the deployment values injected (`app.web.pages`),
``<prefix>/static/<file>`` serves the other static files and ``<prefix>/api/…`` is `app.web.api`.
With a prefix, ``GET <prefix>`` → 301 ``<prefix>/`` and ``GET /`` → 302 ``<prefix>/``.
"""
from __future__ import annotations

from pathlib import Path

from aiohttp import web

from app.config import Config, normalize_prefix
from app.db import Database
from app.web import api, pages, urls
from app.web.keys import CONFIG_KEY, DB_KEY, PREFIX_KEY, STATIC_DIR_KEY

__all__ = ["create_web_app", "STATIC_DIR"]

STATIC_DIR = Path(__file__).resolve().parent / "static"
CLIENT_MAX_SIZE = api.JSON_MAX_BYTES + 64 * 1024


def create_web_app(db: Database, config: Config, *, static_dir: Path | None = None) -> web.Application:
    app = web.Application(middlewares=[api.error_middleware], client_max_size=CLIENT_MAX_SIZE)
    app[DB_KEY] = db
    app[CONFIG_KEY] = config
    prefix = normalize_prefix(config.web_prefix)
    app[PREFIX_KEY] = prefix
    app[STATIC_DIR_KEY] = Path(static_dir) if static_dir is not None else STATIC_DIR

    api.setup_routes(app)
    router = urls.prefixed_router(app)
    router.add_get("/", pages.index)
    router.add_static("/static/", app[STATIC_DIR_KEY], follow_symlinks=False)
    if prefix:
        app.router.add_get(prefix, pages.redirect_permanent)
        app.router.add_get("/", pages.redirect_root)
    app.on_response_prepare.append(_add_security_headers)
    return app


async def _add_security_headers(request: web.Request, response: web.StreamResponse) -> None:
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "same-origin")
    path = urls.local_path(request)
    if path is None:
        return
    if urls.is_api_path(path):
        headers.setdefault("Cache-Control", "no-store")
    elif path.startswith("/static/"):
        headers.setdefault("Cache-Control", "no-cache")
