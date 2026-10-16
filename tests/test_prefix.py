"""The panel under WEB_PREFIX=/partners: redirects, index with <base>, static, API."""
from __future__ import annotations

from tests.conftest import sample_program


async def test_redirects(prefixed_client):
    res = await prefixed_client.get("/partners", allow_redirects=False)
    assert res.status == 301
    assert res.headers["Location"] == "/partners/"

    res = await prefixed_client.get("/", allow_redirects=False)
    assert res.status == 302
    assert res.headers["Location"] == "/partners/"

    res = await prefixed_client.get("/partners?x=1", allow_redirects=False)
    assert res.headers["Location"] == "/partners/?x=1"


async def test_index_has_base_hub_and_version(prefixed_client):
    res = await prefixed_client.get("/partners/")
    assert res.status == 200
    assert res.headers["Content-Type"].startswith("text/html")
    html = await res.text()
    assert '<base href="/partners/">' in html
    assert '<meta name="panel-hub" content="/">' in html
    assert 'name="panel-version" content="1.' in html
    assert 'data-app="partners"' in html
    assert "static/app.js?v=" in html
    assert "static/style.css?v=" in html
    assert "http://" not in html.replace("http://www.w3.org", "") and "https://" not in html  # no CDN


async def test_index_without_prefix_or_hub(client):
    html = await (await client.get("/")).text()
    assert '<base href="/">' in html
    assert '<meta name="panel-hub" content="">' in html


async def test_static_and_api_under_prefix(prefixed_client):
    res = await prefixed_client.get("/partners/static/style.css")
    assert res.status == 200
    assert res.headers["Cache-Control"] == "no-cache"
    assert "--accent: #db2777" in await res.text()

    res = await prefixed_client.get("/partners/static/favicon.svg")
    assert res.status == 200

    res = await prefixed_client.get("/partners/static/../pyproject.toml")
    assert res.status in (403, 404)

    res = await prefixed_client.get("/partners/api/health")
    assert res.status == 200
    assert (await res.json())["status"] == "ok"
    assert res.headers["Cache-Control"] == "no-store"

    res = await prefixed_client.post("/partners/api/programs", json=sample_program())
    assert res.status == 201
    body = await (await prefixed_client.get("/partners/api/meta")).json()
    assert body["hub_url"] == "/" and body["categories"] == ["Хостинг"]

    # outside the prefix nothing is served
    assert (await prefixed_client.get("/api/health")).status == 404
    assert (await prefixed_client.get("/other")).status == 404
