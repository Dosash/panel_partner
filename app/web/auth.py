"""Optional password protection: ``<prefix>/api/auth/*``, the session cookie and the middleware.

When a password is set (`PASSWORD_SETTING` in the database) every ``/api`` request needs a valid
session cookie ``pp_session`` — except ``GET /api/health``, ``GET /api/auth/status`` and
``POST /api/auth/login``; otherwise the answer is ``401 {"error": "Нужно войти", "auth_required": true}``.
The page and the static files are always served: the SPA draws the login screen itself.

CSRF: every non-GET request to the API must carry ``X-Requested-With: fetch`` (403 otherwise); the
cookie is ``SameSite=Strict`` and ``HttpOnly`` on top of that.

Brute force: `app.auth.LoginGuard` per client IP (X-Forwarded-For / X-Real-IP are trusted only
when the direct peer is this machine) — after 5 failures in 10 minutes ``429``.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
from typing import Any

from aiohttp import web

from app.auth import (
    SESSION_TTL,
    LoginGuard,
    PasswordError,
    check_new_password,
    hash_password,
    new_session_token,
    token_hash,
    verify_password,
)
from app.db import PASSWORD_SETTING, Database
from app.web.keys import DB_KEY, LOGIN_GUARD_KEY, PREFIX_KEY
from app.web.urls import is_api_path, local_path, prefixed_router

log = logging.getLogger(__name__)

COOKIE_NAME = "pp_session"
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "fetch"
FAIL_DELAY = 0.5  # seconds added to a wrong password

# (method, local path) that work without a session even when the password is enabled
OPEN_ENDPOINTS = {("GET", "/api/health"), ("GET", "/api/auth/status"), ("POST", "/api/auth/login")}

NEED_LOGIN = "Нужно войти"
WRONG_PASSWORD = "Неверный пароль"


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400, **extra: Any) -> None:
        super().__init__(message)
        self.status = status
        self.extra = extra


def _db(request: web.Request) -> Database:
    return request.app[DB_KEY]


async def password_hash(request: web.Request) -> str | None:
    return await _db(request).get_setting(PASSWORD_SETTING)


async def password_enabled(request: web.Request) -> bool:
    return await password_hash(request) is not None


def cookie_path(request: web.Request) -> str:
    return request.app.get(PREFIX_KEY, "") + "/"


def _is_loopback(host: str | None) -> bool:
    try:
        return ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


def client_ip(request: web.Request) -> str:
    """The client's IP; proxy headers count only when the direct peer is this machine."""
    peer = request.remote or ""
    if _is_loopback(peer):
        forwarded = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return peer or "?"


def is_secure(request: web.Request) -> bool:
    if request.secure:
        return True
    if _is_loopback(request.remote or ""):
        return request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https"
    return False


def session_hash(request: web.Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    return token_hash(token) if token else None


async def has_session(request: web.Request) -> bool:
    h = session_hash(request)
    return h is not None and await _db(request).session_valid(h)


def set_session_cookie(request: web.Request, response: web.Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_TTL, path=cookie_path(request), httponly=True,
        samesite="Strict", secure=True if is_secure(request) else None,
    )


def clear_session_cookie(request: web.Request, response: web.Response) -> None:
    response.del_cookie(COOKIE_NAME, path=cookie_path(request))


async def start_session(request: web.Request, response: web.Response) -> None:
    token = new_session_token()
    await _db(request).create_session(token_hash(token), SESSION_TTL)
    set_session_cookie(request, response, token)


# ------------------------------------------------------------------ middleware

@web.middleware
async def auth_middleware(request: web.Request, handler: Any) -> web.StreamResponse:
    path = local_path(request)
    if path is None or not is_api_path(path):
        return await handler(request)
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        return web.json_response({"error": f"Запрос без заголовка {CSRF_HEADER}: {CSRF_VALUE}"}, status=403)
    if (request.method, path) in OPEN_ENDPOINTS:
        return await handler(request)
    if await password_enabled(request) and not await has_session(request):
        return web.json_response({"error": NEED_LOGIN, "auth_required": True}, status=401)
    return await handler(request)


# ------------------------------------------------------------------ handlers

async def _json_body(request: web.Request) -> dict[str, Any]:
    from app.web.api import read_json  # local import: api imports nothing from here

    body = await read_json(request)
    if not isinstance(body, dict):
        raise AuthError("Ожидается объект")
    return body


async def status(request: web.Request) -> web.Response:
    enabled = await password_enabled(request)
    return web.json_response({"enabled": enabled, "authenticated": not enabled or await has_session(request)})


async def login(request: web.Request) -> web.Response:
    stored = await password_hash(request)
    if stored is None:
        return web.json_response({"ok": True, "enabled": False})
    guard: LoginGuard = request.app[LOGIN_GUARD_KEY]
    key = client_ip(request)
    wait = guard.retry_after(key)
    if wait:
        minutes = max(1, (wait + 59) // 60)
        return web.json_response({"error": f"Слишком много попыток, подождите {minutes} мин."}, status=429,
                                 headers={"Retry-After": str(wait)})
    body = await _json_body(request)
    if not verify_password(stored, body.get("password")):
        guard.failure(key)
        log.warning("Неверный пароль при входе (клиент %s)", key)
        await asyncio.sleep(FAIL_DELAY)
        return web.json_response({"error": WRONG_PASSWORD, "field": "password"}, status=401)
    guard.success(key)
    response = web.json_response({"ok": True, "enabled": True})
    await start_session(request, response)
    return response


async def logout(request: web.Request) -> web.Response:
    h = session_hash(request)
    if h:
        await _db(request).delete_session(h)
    response = web.json_response({"ok": True})
    clear_session_cookie(request, response)
    return response


async def logout_all(request: web.Request) -> web.Response:
    removed = await _db(request).delete_sessions()
    response = web.json_response({"ok": True, "removed": removed})
    clear_session_cookie(request, response)
    return response


async def enable(request: web.Request) -> web.Response:
    if await password_enabled(request):
        raise AuthError("Пароль уже включён — используйте смену пароля", 409)
    body = await _json_body(request)
    try:
        password = check_new_password(body.get("password"))
    except PasswordError as exc:
        raise AuthError(str(exc), field="password") from None
    db = _db(request)
    await db.delete_sessions()
    await db.set_setting(PASSWORD_SETTING, hash_password(password))
    log.info("Доступ по паролю включён")
    response = web.json_response({"ok": True, "enabled": True})
    await start_session(request, response)
    return response


async def _check_current(request: web.Request, body: dict[str, Any]) -> None:
    stored = await password_hash(request)
    if stored is None:
        raise AuthError("Пароль не включён", 409)
    if not verify_password(stored, body.get("current")):
        await asyncio.sleep(FAIL_DELAY)
        raise AuthError("Текущий пароль неверный", 400, field="current")


async def change(request: web.Request) -> web.Response:
    body = await _json_body(request)
    await _check_current(request, body)
    try:
        password = check_new_password(body.get("new"))
    except PasswordError as exc:
        raise AuthError(str(exc).replace("Пароль:", "Новый пароль:"), field="new") from None
    db = _db(request)
    await db.set_setting(PASSWORD_SETTING, hash_password(password))
    await db.delete_sessions(keep_hash=session_hash(request))
    log.info("Пароль изменён, остальные сессии завершены")
    return web.json_response({"ok": True})


async def disable(request: web.Request) -> web.Response:
    body = await _json_body(request)
    await _check_current(request, body)
    db = _db(request)
    await db.delete_setting(PASSWORD_SETTING)
    await db.delete_sessions()
    log.info("Доступ по паролю отключён")
    response = web.json_response({"ok": True, "enabled": False})
    clear_session_cookie(request, response)
    return response


def setup_routes(app: web.Application) -> None:
    router = prefixed_router(app)
    router.add_get("/api/auth/status", status)
    router.add_post("/api/auth/login", login)
    router.add_post("/api/auth/logout", logout)
    router.add_post("/api/auth/logout-all", logout_all)
    router.add_post("/api/auth/enable", enable)
    router.add_post("/api/auth/change", change)
    router.add_post("/api/auth/disable", disable)
