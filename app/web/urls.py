"""The panel's URL prefix (``WEB_PREFIX``): routes and the path relative to the prefix.

The whole panel (index, static files, API) lives under ``app[PREFIX_KEY]`` — ``''`` (site root,
the default) or e.g. ``'/partners'`` behind a reverse proxy that serves several panels and does
not strip the prefix.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from aiohttp import web

from app.web.keys import PREFIX_KEY


def local_path(request: web.Request) -> str | None:
    """Request path relative to the panel prefix: ``/partners/api/x`` → ``/api/x``,
    ``/partners`` → ``''``; None when the path is outside the prefix."""
    prefix = request.app.get(PREFIX_KEY, "")
    path = request.path
    if not prefix:
        return path
    if path == prefix:
        return ""
    if path.startswith(prefix + "/"):
        return path[len(prefix):]
    return None


def is_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


class PrefixedRouter:
    """``app.router`` with the panel prefix added to every path."""

    def __init__(self, router: web.UrlDispatcher, prefix: str) -> None:
        self._router = router
        self.prefix = prefix

    def add_route(self, method: str, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_route(method, self.prefix + path, handler, **kwargs)

    def add_get(self, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_get(self.prefix + path, handler, **kwargs)

    def add_post(self, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_post(self.prefix + path, handler, **kwargs)

    def add_put(self, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_put(self.prefix + path, handler, **kwargs)

    def add_patch(self, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_patch(self.prefix + path, handler, **kwargs)

    def add_delete(self, path: str, handler: Any, **kwargs: Any) -> web.AbstractRoute:
        return self._router.add_delete(self.prefix + path, handler, **kwargs)

    def add_static(self, path: str, directory: Path, **kwargs: Any) -> web.AbstractResource:
        return self._router.add_static(self.prefix + path, directory, **kwargs)


def prefixed_router(app: web.Application) -> PrefixedRouter:
    return PrefixedRouter(app.router, app.get(PREFIX_KEY, ""))
