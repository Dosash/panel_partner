"""JSON API under ``<prefix>/api``.

* ``GET  /api/health``          — ``{status, version, auth, programs, links}`` (for the hub and Docker);
  with the password enabled the counters are left out (the endpoint is open)
* ``/api/auth/*``               — see `app.web.auth`
* ``GET  /api/meta``            — version, hub_url, categories, tags, payout models, statuses
* ``GET  /api/programs``        — all programs with their links
* ``POST /api/programs``        — create (201, the created program)
* ``GET/PUT/PATCH/DELETE /api/programs/{id}`` — PUT replaces the program and its links,
  PATCH changes ``favorite`` / ``status`` only
* ``GET  /api/export``          — JSON file with everything (``Content-Disposition: attachment``)
* ``POST /api/import``          — add the programs of such a file; ``{added, skipped, errors}``

Errors are ``{"error": "…"}`` in Russian (``field`` names the bad form field when known).
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from aiohttp import web

from app import __version__
from app.db import PASSWORD_SETTING, PAYOUT_MODELS, STATUSES, Database
from app.programs import ValidationError, clean_patch, clean_program, clean_timestamp
from app.web.auth import AuthError
from app.web.keys import CONFIG_KEY, DB_KEY
from app.web.urls import is_api_path, local_path, prefixed_router

log = logging.getLogger(__name__)

JSON_MAX_BYTES = 2 * 1024 * 1024  # a request body (the import file included)
IMPORT_MAX_PROGRAMS = 5000
EXPORT_FORMAT = "panel-partner"

_STATUS_MESSAGES = {
    400: "Неверный запрос",
    404: "Не найдено",
    405: "Метод не поддерживается",
    413: "Слишком большой запрос",
    415: "Неподдерживаемый формат данных",
}


def json_error(message: str, status: int = 400, field: str = "") -> web.Response:
    body: dict[str, Any] = {"error": message}
    if field:
        body["field"] = field
    return web.json_response(body, status=status)


@web.middleware
async def error_middleware(request: web.Request, handler: Any) -> web.StreamResponse:
    """For ``/api``: HTTP errors → JSON ``{"error"}``; validation → 400; others → 500 JSON."""
    path = local_path(request)
    if path is None or not is_api_path(path):
        return await handler(request)
    try:
        return await handler(request)
    except ValidationError as exc:
        return json_error(str(exc), 400, exc.field)
    except AuthError as exc:
        body: dict[str, Any] = {"error": str(exc), **exc.extra}
        return web.json_response(body, status=exc.status)
    except web.HTTPException as exc:
        if exc.status < 400:
            raise
        headers = {k: v for k, v in exc.headers.items() if k in ("Allow", "Retry-After")}
        message = _STATUS_MESSAGES.get(exc.status) or exc.reason or "Ошибка запроса"
        return web.json_response({"error": message}, status=exc.status, headers=headers)
    except Exception:
        log.exception("Unhandled error in %s %s", request.method, request.path)
        return json_error("Внутренняя ошибка сервера", 500)


def _db(request: web.Request) -> Database:
    return request.app[DB_KEY]


def path_id(request: web.Request) -> int:
    raw = request.match_info.get("id", "")
    if not raw.isdigit() or int(raw) <= 0:
        raise web.HTTPNotFound()
    return int(raw)


async def read_json(request: web.Request) -> Any:
    if request.content_length is not None and request.content_length > JSON_MAX_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=JSON_MAX_BYTES, actual_size=request.content_length)
    raw = await request.content.read(JSON_MAX_BYTES + 1)
    if len(raw) > JSON_MAX_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=JSON_MAX_BYTES, actual_size=len(raw))
    if not raw.strip():
        raise ValidationError("Пустое тело запроса")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ValidationError("Тело запроса не является корректным JSON") from None


# ------------------------------------------------------------------ handlers

async def health(request: web.Request) -> web.Response:
    db = _db(request)
    try:
        auth = await db.get_setting(PASSWORD_SETTING) is not None
        counts = None if auth else await db.counts()
    except Exception:
        log.exception("Health: the database cannot be read")
        return web.json_response({"status": "error", "version": __version__,
                                  "problems": ["База данных недоступна"]}, status=503)
    body: dict[str, Any] = {"status": "ok", "version": __version__, "auth": auth}
    if counts is not None:  # the endpoint is open: no numbers while the panel is password-protected
        body.update(programs=counts["programs"], links=counts["links"])
    return web.json_response(body)


async def meta(request: web.Request) -> web.Response:
    db = _db(request)
    return web.json_response({
        "version": __version__,
        "hub_url": request.app[CONFIG_KEY].hub_url,
        "categories": await db.categories(),
        "tags": await db.tags(),
        "payout_models": list(PAYOUT_MODELS),
        "statuses": list(STATUSES),
    })


async def list_programs(request: web.Request) -> web.Response:
    return web.json_response({"programs": await _db(request).list_programs()})


async def create_program(request: web.Request) -> web.Response:
    fields, links = clean_program(await read_json(request))
    db = _db(request)
    program_id = await db.create_program(fields, links)
    return web.json_response(await db.get_program(program_id), status=201)


async def get_program(request: web.Request) -> web.Response:
    program = await _db(request).get_program(path_id(request))
    if program is None:
        raise web.HTTPNotFound()
    return web.json_response(program)


async def replace_program(request: web.Request) -> web.Response:
    program_id = path_id(request)
    fields, links = clean_program(await read_json(request))
    db = _db(request)
    if not await db.replace_program(program_id, fields, links):
        raise web.HTTPNotFound()
    return web.json_response(await db.get_program(program_id))


async def patch_program(request: web.Request) -> web.Response:
    program_id = path_id(request)
    fields = clean_patch(await read_json(request))
    db = _db(request)
    if not await db.patch_program(program_id, fields):
        raise web.HTTPNotFound()
    return web.json_response(await db.get_program(program_id))


async def delete_program(request: web.Request) -> web.Response:
    if not await _db(request).delete_program(path_id(request)):
        raise web.HTTPNotFound()
    return web.json_response({"ok": True})


async def export_data(request: web.Request) -> web.Response:
    programs = sorted(await _db(request).list_programs(), key=lambda p: p["id"])
    for program in programs:
        for link in program["links"]:
            link.pop("program_id", None)
    payload = {"format": EXPORT_FORMAT, "version": __version__, "exported_at": int(time.time()),
               "programs": programs}
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    stamp = time.strftime("%Y-%m-%d", time.gmtime())
    return web.Response(
        text=body, content_type="application/json", charset="utf-8",
        headers={"Content-Disposition": f'attachment; filename="partners-export-{stamp}.json"'},
    )


async def import_data(request: web.Request) -> web.Response:
    payload = await read_json(request)
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict) and isinstance(payload.get("programs"), list):
        items = payload["programs"]
    else:
        raise ValidationError("Ожидается файл экспорта панели: объект с полем programs (список программ)")
    if len(items) > IMPORT_MAX_PROGRAMS:
        raise ValidationError(f"В одном файле не больше {IMPORT_MAX_PROGRAMS} программ")
    db = _db(request)
    added = 0
    errors: list[str] = []
    for index, item in enumerate(items):
        try:
            fields, links = clean_program(item)
        except ValidationError as exc:
            name = item.get("name") if isinstance(item, dict) and isinstance(item.get("name"), str) else ""
            label = f"«{name[:40]}»" if name else f"№{index + 1}"
            errors.append(f"Программа {label}: {exc}")
            continue
        if isinstance(item, dict):
            created = clean_timestamp(item.get("created_at"))
            updated = clean_timestamp(item.get("updated_at"))
            if created is not None:
                fields["created_at"] = created
            if updated is not None:
                fields["updated_at"] = updated
        await db.create_program(fields, links)
        added += 1
    return web.json_response({"added": added, "skipped": len(errors), "errors": errors[:50]})


def setup_routes(app: web.Application) -> None:
    router = prefixed_router(app)
    router.add_get("/api/health", health)
    router.add_get("/api/meta", meta)
    router.add_get("/api/programs", list_programs)
    router.add_post("/api/programs", create_program)
    router.add_get("/api/programs/{id}", get_program)
    router.add_put("/api/programs/{id}", replace_program)
    router.add_patch("/api/programs/{id}", patch_program)
    router.add_delete("/api/programs/{id}", delete_program)
    router.add_get("/api/export", export_data)
    router.add_post("/api/import", import_data)
