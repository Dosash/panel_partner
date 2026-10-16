"""Password protection: enable / login / logout / change / disable, cookies, CSRF, rate limit, CLI."""
from __future__ import annotations

import pytest

from app import __main__ as cli
from app.auth import LoginGuard, hash_password, verify_password
from app.config import Config
from app.db import PASSWORD_SETTING, Database
from app.web import create_web_app
from app.web.auth import COOKIE_NAME
from tests.conftest import make_client, make_config, sample_program

PASSWORD = "correct horse battery"


async def enable(client, password: str = PASSWORD):
    res = await client.post("/api/auth/enable", json={"password": password})
    assert res.status == 200, await res.text()
    return res


def test_hashing():
    stored = hash_password("secret-123")
    assert stored.startswith("scrypt$16384$8$1$")
    assert verify_password(stored, "secret-123")
    assert not verify_password(stored, "secret-124")
    assert not verify_password(stored, None)
    assert not verify_password(None, "secret-123")
    assert not verify_password("garbage", "secret-123")
    assert hash_password("x" * 8) != hash_password("x" * 8)  # fresh salt


def test_login_guard():
    g = LoginGuard(attempts=3, window=60)
    assert g.retry_after("a", now=0) == 0
    for t in (1, 2, 3):
        g.failure("a", now=t)
    assert g.retry_after("a", now=4) > 0
    assert g.retry_after("b", now=4) == 0
    assert g.retry_after("a", now=62) == 0  # the window passed
    g.failure("a", now=70)
    g.success("a")
    assert g.retry_after("a", now=71) == 0


async def test_status_and_enable_protects_api(client):
    assert await (await client.get("/api/auth/status")).json() == {"enabled": False, "authenticated": True}
    await client.post("/api/programs", json=sample_program())

    for bad in ("short", "x" * 129, 123, None):
        res = await client.post("/api/auth/enable", json={"password": bad})
        assert res.status == 400, bad
        assert (await res.json())["field"] == "password"

    res = await enable(client)
    assert (await res.json()) == {"ok": True, "enabled": True}
    cookie = res.cookies[COOKIE_NAME]
    assert cookie.value and cookie["httponly"] and cookie["samesite"] == "Strict" and cookie["path"] == "/"
    assert not cookie["secure"]  # plain http in tests

    # the enabling client stays logged in; a new client is locked out
    assert await (await client.get("/api/auth/status")).json() == {"enabled": True, "authenticated": True}
    assert (await client.get("/api/programs")).status == 200
    assert (await client.post("/api/auth/enable", json={"password": PASSWORD})).status == 409

    async with make_client(client.server.app) as other:
        assert await (await other.get("/api/auth/status")).json() == {"enabled": True, "authenticated": False}
        for method, path in (("GET", "/api/programs"), ("GET", "/api/meta"), ("GET", "/api/export"),
                             ("POST", "/api/programs"), ("POST", "/api/auth/logout"), ("POST", "/api/auth/change")):
            res = await other.request(method, path, json={})
            assert res.status == 401, (method, path)
            assert await res.json() == {"error": "Нужно войти", "auth_required": True}
        # health stays open, but without the counters
        body = await (await other.get("/api/health")).json()
        assert body == {"status": "ok", "version": body["version"], "auth": True}
        # the page and the static files are served
        assert (await other.get("/")).status == 200
        assert (await other.get("/static/app.js")).status == 200


async def test_login_wrong_and_right(client):
    await enable(client)
    async with make_client(client.server.app) as other:
        res = await other.post("/api/auth/login", json={"password": "nope-nope-nope"})
        assert res.status == 401
        assert (await res.json()) == {"error": "Неверный пароль", "field": "password"}
        assert COOKIE_NAME not in res.cookies
        assert (await other.get("/api/programs")).status == 401

        res = await other.post("/api/auth/login", json={"password": PASSWORD})
        assert res.status == 200
        assert COOKIE_NAME in res.cookies
        assert (await other.get("/api/programs")).status == 200
        assert await (await other.get("/api/auth/status")).json() == {"enabled": True, "authenticated": True}

        # a forged cookie is not a session
        other.session.cookie_jar.clear()
        other.session.cookie_jar.update_cookies({COOKIE_NAME: "forged"}, client.make_url("/"))
        assert (await other.get("/api/programs")).status == 401


async def test_cookie_path_under_prefix_and_secure_behind_proxy(prefixed_client):
    res = await prefixed_client.post("/partners/api/auth/enable", json={"password": PASSWORD})
    assert res.status == 200
    assert res.cookies[COOKIE_NAME]["path"] == "/partners/"
    assert (await prefixed_client.get("/partners/api/programs")).status == 200

    async with make_client(prefixed_client.server.app) as other:
        res = await other.post("/partners/api/auth/login", json={"password": PASSWORD},
                               headers={"X-Forwarded-Proto": "https"})
        assert res.status == 200
        assert res.cookies[COOKIE_NAME]["secure"]  # the test client is a loopback peer: the proxy header counts


async def test_logout_and_logout_all(client):
    await enable(client)
    async with make_client(client.server.app) as other:
        await other.post("/api/auth/login", json={"password": PASSWORD})
        assert (await other.get("/api/programs")).status == 200

        res = await other.post("/api/auth/logout")
        assert res.status == 200
        assert res.cookies[COOKIE_NAME].value == ""  # cleared
        assert (await other.get("/api/programs")).status == 401
        assert (await client.get("/api/programs")).status == 200  # the other device stays

        await other.post("/api/auth/login", json={"password": PASSWORD})
        res = await other.post("/api/auth/logout-all")
        assert (await res.json())["removed"] == 2
        assert (await other.get("/api/programs")).status == 401
        assert (await client.get("/api/programs")).status == 401


async def test_change_password_kills_other_sessions(client):
    await enable(client)
    async with make_client(client.server.app) as other:
        await other.post("/api/auth/login", json={"password": PASSWORD})

        res = await client.post("/api/auth/change", json={"current": "wrong-wrong", "new": "new-password-1"})
        assert res.status == 400
        assert (await res.json())["field"] == "current"
        res = await client.post("/api/auth/change", json={"current": PASSWORD, "new": "short"})
        assert res.status == 400
        assert (await res.json())["field"] == "new"

        res = await client.post("/api/auth/change", json={"current": PASSWORD, "new": "new-password-1"})
        assert res.status == 200
        assert (await client.get("/api/programs")).status == 200  # this session survives
        assert (await other.get("/api/programs")).status == 401  # the other one is gone
        assert (await other.post("/api/auth/login", json={"password": PASSWORD})).status == 401
        assert (await other.post("/api/auth/login", json={"password": "new-password-1"})).status == 200


async def test_disable(client, db):
    await enable(client)
    res = await client.post("/api/auth/disable", json={"current": "not-the-password"})
    assert res.status == 400
    assert (await res.json())["error"] == "Текущий пароль неверный"
    assert await db.get_setting(PASSWORD_SETTING) is not None

    res = await client.post("/api/auth/disable", json={"current": PASSWORD})
    assert res.status == 200
    assert await db.get_setting(PASSWORD_SETTING) is None
    assert await db.sessions_count() == 0
    async with make_client(client.server.app) as other:
        assert await (await other.get("/api/auth/status")).json() == {"enabled": False, "authenticated": True}
        assert (await other.get("/api/programs")).status == 200
        body = await (await other.get("/api/health")).json()
        assert body["auth"] is False and "programs" in body
    assert (await client.post("/api/auth/disable", json={"current": PASSWORD})).status == 409


async def test_rate_limit(client):
    await enable(client)
    async with make_client(client.server.app) as other:
        for _ in range(5):
            assert (await other.post("/api/auth/login", json={"password": "bad-bad-bad"})).status == 401
        res = await other.post("/api/auth/login", json={"password": PASSWORD})  # even the right one
        assert res.status == 429
        assert "Слишком много попыток" in (await res.json())["error"]
        assert int(res.headers["Retry-After"]) > 0

        # another client IP (proxy header from the loopback peer) is not affected
        res = await other.post("/api/auth/login", json={"password": PASSWORD}, headers={"X-Forwarded-For": "203.0.113.7"})
        assert res.status == 200


async def test_csrf_header_required_for_auth_endpoints(db):
    async with make_client(create_web_app(db, make_config()), csrf=False) as bare:
        res = await bare.post("/api/auth/enable", json={"password": PASSWORD})
        assert res.status == 403
        res = await bare.post("/api/auth/login", json={"password": PASSWORD})
        assert res.status == 403
        assert (await bare.get("/api/auth/status")).status == 200


async def test_reset_password_cli(tmp_path, capsys):
    path = tmp_path / "partners.db"
    db = Database(path)
    await db.connect()
    await db.set_setting(PASSWORD_SETTING, hash_password(PASSWORD))
    await db.create_session("abc", 3600)
    await db.close()

    config = Config(db_path=str(path))
    assert await cli.reset_password(config) is True

    db = Database(path)
    await db.connect()
    try:
        assert await db.get_setting(PASSWORD_SETTING) is None
        assert await db.sessions_count() == 0
    finally:
        await db.close()
    assert await cli.reset_password(config) is False


def test_cli_main_reset(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "x.db"))
    assert cli.main(["reset-password"]) == 0
    assert "сессии очищены" in capsys.readouterr().out
    assert cli.main(["bogus"]) == 2


async def test_migration_1_to_2_keeps_programs(tmp_path):
    """A v1.0 database (user_version 1, no settings/sessions) migrates in place."""
    import aiosqlite

    from app.db import _MIGRATIONS

    path = tmp_path / "old.db"
    async with aiosqlite.connect(path) as conn:
        for statement in _MIGRATIONS[1]:
            await conn.execute(statement)
        await conn.execute(
            "INSERT INTO programs (name, tags_json, created_at, updated_at) VALUES ('Old one', '[\"t\"]', 1, 1)"
        )
        await conn.execute("INSERT INTO links (program_id, url) VALUES (1, 'https://example.com')")
        await conn.execute("PRAGMA user_version=1")
        await conn.commit()

    db = Database(path)
    await db.connect()
    try:
        assert await db.schema_version() == 2
        program = await db.get_program(1)
        assert program and program["name"] == "Old one" and program["tags"] == ["t"] and len(program["links"]) == 1
        assert await db.get_setting(PASSWORD_SETTING) is None
        await db.set_setting(PASSWORD_SETTING, "x")
        assert await db.get_setting(PASSWORD_SETTING) == "x"
    finally:
        await db.close()


@pytest.mark.parametrize("prefix", ["", "/partners"])
async def test_login_when_password_disabled(db, prefix):
    async with make_client(create_web_app(db, make_config(web_prefix=prefix))) as c:
        res = await c.post(f"{prefix}/api/auth/login", json={"password": "anything"})
        assert res.status == 200
        assert (await res.json()) == {"ok": True, "enabled": False}
        assert COOKIE_NAME not in res.cookies
