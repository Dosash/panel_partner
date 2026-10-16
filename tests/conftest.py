import sys
from pathlib import Path

import pytest
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Config  # noqa: E402
from app.db import Database  # noqa: E402
from app.web import create_web_app  # noqa: E402


@pytest.fixture
async def db():
    database = Database(":memory:")
    await database.connect()
    yield database
    await database.close()


def make_config(**kwargs) -> Config:
    return Config(**kwargs)


@pytest.fixture
async def client(db):
    app = create_web_app(db, make_config())
    async with TestClient(TestServer(app)) as c:
        yield c


@pytest.fixture
async def prefixed_client(db):
    app = create_web_app(db, make_config(web_prefix="/partners", hub_url="/"))
    async with TestClient(TestServer(app)) as c:
        yield c


def sample_program(**overrides) -> dict:
    data = {
        "name": "Example Hosting Partners",
        "category": "Хостинг",
        "status": "active",
        "description": "Партнёрка хостинга: платит за оплаченные заказы.",
        "website_url": "https://partners.example.com",
        "cabinet_url": "https://partners.example.com/cabinet",
        "login": "owner@example.com",
        "payout_model": "RevShare",
        "payout_terms": "40% RevShare пожизненно",
        "payout_min": "50 $",
        "payout_method": "USDT",
        "tags": ["хостинг", "revshare"],
        "notes": "Менеджер отвечает в течение дня.",
        "favorite": True,
        "links": [
            {"title": "Основная", "url": "https://example.com/?ref=abc", "promo_code": "PROMO2026", "note": "для всех"},
            {"title": "Лендинг VPS", "url": "https://example.com/vps?ref=abc", "promo_code": "", "note": ""},
        ],
    }
    data.update(overrides)
    return data
