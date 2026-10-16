"""API tests: CRUD, validation, PUT replaces links, PATCH, export → import, health, meta."""
from __future__ import annotations

import json

from tests.conftest import sample_program


async def test_health_and_counts(client):
    res = await client.get("/api/health")
    assert res.status == 200
    assert res.headers["Cache-Control"] == "no-store"
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "same-origin"
    body = await res.json()
    assert body == {"status": "ok", "version": body["version"], "programs": 0, "links": 0}

    await client.post("/api/programs", json=sample_program())
    body = await (await client.get("/api/health")).json()
    assert (body["programs"], body["links"]) == (1, 2)


async def test_create_and_get(client):
    res = await client.post("/api/programs", json=sample_program())
    assert res.status == 201, await res.text()
    created = await res.json()
    assert created["id"] == 1
    assert created["name"] == "Example Hosting Partners"
    assert created["tags"] == ["хостинг", "revshare"]
    assert created["favorite"] is True
    assert [l["url"] for l in created["links"]] == ["https://example.com/?ref=abc", "https://example.com/vps?ref=abc"]
    assert [l["sort"] for l in created["links"]] == [0, 1]
    assert created["created_at"] > 0 and created["updated_at"] >= created["created_at"]
    assert "password" not in json.dumps(created)

    res = await client.get("/api/programs/1")
    assert res.status == 200
    assert (await res.json())["links"][0]["promo_code"] == "PROMO2026"

    res = await client.get("/api/programs")
    programs = (await res.json())["programs"]
    assert len(programs) == 1 and programs[0]["links"][1]["title"] == "Лендинг VPS"


async def test_name_required_and_limits(client):
    res = await client.post("/api/programs", json=sample_program(name="   "))
    assert res.status == 400
    body = await res.json()
    assert body["error"].startswith("Название")
    assert body["field"] == "name"

    res = await client.post("/api/programs", json=sample_program(name="x" * 201))
    assert res.status == 400
    assert "200" in (await res.json())["error"]

    res = await client.post("/api/programs", json=sample_program(status="deleted"))
    assert res.status == 400
    assert (await res.json())["field"] == "status"

    res = await client.post("/api/programs", json=sample_program(payout_model="Bitcoin"))
    assert res.status == 400
    assert (await res.json())["field"] == "payout_model"

    res = await client.post("/api/programs", data=b"{not json", headers={"Content-Type": "application/json"})
    assert res.status == 400
    assert "JSON" in (await res.json())["error"]

    res = await client.post("/api/programs", json=[1, 2])
    assert res.status == 400


async def test_url_validation(client):
    for bad in ("ftp://example.com", "javascript:alert(1)", "example.com", "https://", "http://exa mple.com"):
        res = await client.post("/api/programs", json=sample_program(website_url=bad))
        assert res.status == 400, bad
        body = await res.json()
        assert body["field"] == "website_url", bad
        assert "https://example.com" in body["error"]

    # optional URLs may be empty
    res = await client.post("/api/programs", json=sample_program(website_url="", cabinet_url=None))
    assert res.status == 201
    created = await res.json()
    assert created["website_url"] == "" and created["cabinet_url"] == ""

    # a link needs a URL
    res = await client.post("/api/programs", json=sample_program(links=[{"title": "x", "url": ""}]))
    assert res.status == 400
    body = await res.json()
    assert body["field"] == "links.0.url"
    assert body["error"].startswith("Ссылка 1")

    res = await client.post("/api/programs", json=sample_program(links=[{"url": "https://ok.example"}, {"url": "mailto:a@b"}]))
    assert res.status == 400
    assert (await res.json())["field"] == "links.1.url"


async def test_tags_are_cleaned(client):
    res = await client.post("/api/programs", json=sample_program(tags=[" #Игры ", "игры", "", "cpa"]))
    assert res.status == 201
    assert (await res.json())["tags"] == ["Игры", "cpa"]
    res = await client.post("/api/programs", json=sample_program(tags="a, b ,, c"))
    assert (await res.json())["tags"] == ["a", "b", "c"]


async def test_put_replaces_program_and_links(client):
    created = await (await client.post("/api/programs", json=sample_program())).json()
    pid = created["id"]
    old_link_ids = {l["id"] for l in created["links"]}

    payload = sample_program(name="Renamed", favorite=False, tags=[], links=[
        {"title": "Только одна", "url": "https://example.org/?r=1", "promo_code": "NEW", "note": ""},
    ])
    res = await client.put(f"/api/programs/{pid}", json=payload)
    assert res.status == 200, await res.text()
    updated = await res.json()
    assert updated["name"] == "Renamed"
    assert updated["favorite"] is False
    assert updated["tags"] == []
    assert len(updated["links"]) == 1
    assert updated["links"][0]["url"] == "https://example.org/?r=1"
    assert updated["links"][0]["sort"] == 0
    assert not old_link_ids & {l["id"] for l in updated["links"]}
    assert updated["created_at"] == created["created_at"]

    # PUT with an empty list removes every link; a missing "links" key means no links too
    res = await client.put(f"/api/programs/{pid}", json=sample_program(links=[]))
    assert (await res.json())["links"] == []
    health = await (await client.get("/api/health")).json()
    assert health["links"] == 0

    # a failed PUT changes nothing
    res = await client.put(f"/api/programs/{pid}", json=sample_program(name="", links=[{"url": "https://x.example"}]))
    assert res.status == 400
    assert (await (await client.get(f"/api/programs/{pid}")).json())["name"] == "Example Hosting Partners"

    res = await client.put("/api/programs/999", json=sample_program())
    assert res.status == 404
    assert (await res.json())["error"] == "Не найдено"


async def test_patch_favorite_and_status(client):
    created = await (await client.post("/api/programs", json=sample_program(favorite=False))).json()
    pid = created["id"]
    res = await client.patch(f"/api/programs/{pid}", json={"favorite": True})
    assert res.status == 200
    body = await res.json()
    assert body["favorite"] is True and body["links"] and body["name"] == created["name"]

    res = await client.patch(f"/api/programs/{pid}", json={"status": "archived"})
    assert (await res.json())["status"] == "archived"

    res = await client.patch(f"/api/programs/{pid}", json={"name": "nope"})
    assert res.status == 400
    assert "favorite" in (await res.json())["error"]

    res = await client.patch(f"/api/programs/{pid}", json={})
    assert res.status == 400

    res = await client.patch(f"/api/programs/{pid}", json={"favorite": "yes"})
    assert res.status == 400

    res = await client.patch("/api/programs/42", json={"favorite": True})
    assert res.status == 404


async def test_delete_cascades_links(client, db):
    created = await (await client.post("/api/programs", json=sample_program())).json()
    res = await client.delete(f"/api/programs/{created['id']}")
    assert res.status == 200
    assert (await client.get(f"/api/programs/{created['id']}")).status == 404
    assert await db.fetchall("SELECT * FROM links") == []
    assert (await client.delete(f"/api/programs/{created['id']}")).status == 404
    assert (await client.get("/api/programs/abc")).status == 404


async def test_meta(client):
    await client.post("/api/programs", json=sample_program(category="Хостинг", tags=["b", "a"]))
    await client.post("/api/programs", json=sample_program(category="VPN", tags=["c"]))
    await client.post("/api/programs", json=sample_program(category="", tags=[]))
    body = await (await client.get("/api/meta")).json()
    assert body["categories"] == ["VPN", "Хостинг"]
    assert body["tags"] == ["a", "b", "c"]
    assert "RevShare" in body["payout_models"]
    assert body["statuses"] == ["active", "paused", "archived"]
    assert body["hub_url"] == ""
    assert body["version"]


async def test_export_import_roundtrip(client, db):
    a = await (await client.post("/api/programs", json=sample_program())).json()
    b = await (await client.post("/api/programs", json=sample_program(name="Second", links=[]))).json()

    res = await client.get("/api/export")
    assert res.status == 200
    assert res.headers["Content-Type"].startswith("application/json")
    assert "attachment" in res.headers["Content-Disposition"]
    assert "partners-export-" in res.headers["Content-Disposition"]
    export = json.loads(await res.text())
    assert export["format"] == "panel-partner"
    assert [p["name"] for p in export["programs"]] == [a["name"], b["name"]]
    assert "program_id" not in export["programs"][0]["links"][0]

    # wipe and restore
    await db.delete_program(a["id"])
    await db.delete_program(b["id"])
    assert (await (await client.get("/api/health")).json())["programs"] == 0

    res = await client.post("/api/import", json=export)
    assert res.status == 200, await res.text()
    body = await res.json()
    assert body == {"added": 2, "skipped": 0, "errors": []}

    programs = (await (await client.get("/api/programs")).json())["programs"]
    by_name = {p["name"]: p for p in programs}
    restored = by_name[a["name"]]
    assert restored["id"] != a["id"]  # new ids
    assert restored["created_at"] == a["created_at"]  # timestamps are kept
    assert [l["url"] for l in restored["links"]] == [l["url"] for l in a["links"]]
    assert restored["links"][0]["promo_code"] == "PROMO2026"
    assert restored["tags"] == a["tags"]
    assert restored["favorite"] is True
    assert by_name["Second"]["links"] == []

    # re-exporting the restored data gives the same programs
    again = json.loads(await (await client.get("/api/export")).text())
    strip = lambda p: {k: v for k, v in p.items() if k not in ("id", "links")} | {"links": [{k: v for k, v in l.items() if k != "id"} for l in p["links"]]}  # noqa: E731
    assert [strip(p) for p in again["programs"]] == [strip(p) for p in export["programs"]]


async def test_import_validates_items(client):
    payload = {"programs": [
        sample_program(name="Good"),
        sample_program(name="", links=[]),
        sample_program(name="Bad link", links=[{"url": "not-a-url"}]),
        "garbage",
    ]}
    res = await client.post("/api/import", json=payload)
    assert res.status == 200
    body = await res.json()
    assert body["added"] == 1 and body["skipped"] == 3
    assert len(body["errors"]) == 3
    assert body["errors"][0].startswith("Программа №2")
    assert "Bad link" in body["errors"][1]
    assert (await (await client.get("/api/health")).json())["programs"] == 1

    res = await client.post("/api/import", json={"nope": 1})
    assert res.status == 400
    assert "programs" in (await res.json())["error"]

    res = await client.post("/api/import", json=[sample_program(name="Plain list")])
    assert (await res.json())["added"] == 1


async def test_request_body_limit(client):
    big = sample_program(notes="x" * (2 * 1024 * 1024 + 10))
    res = await client.post("/api/programs", json=big)
    assert res.status == 413
    assert (await res.json())["error"] == "Слишком большой запрос"


async def test_api_errors_are_json(client):
    res = await client.get("/api/nothing")
    assert res.status == 404
    assert await res.json() == {"error": "Не найдено"}
    res = await client.delete("/api/programs")
    assert res.status == 405
    assert (await res.json())["error"] == "Метод не поддерживается"
