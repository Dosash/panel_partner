"""Validation of the program / link payloads sent to the API (and found in an import file).

`clean_program(payload)` returns ``(fields, links)`` ready for `app.db.Database` or raises
`ValidationError` with a Russian message. Optional URLs may be empty; a non-empty URL must be
``http://`` or ``https://``.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

from app.db import PAYOUT_MODELS, STATUS_ACTIVE, STATUSES

NAME_MAX = 200
SHORT_MAX = 100
URL_MAX = 2048
TEXT_MAX = 4000
TAG_MAX = 40
TAGS_MAX = 30
LINKS_MAX = 100
LOGIN_MAX = 200
PROMO_MAX = 100

FIELD_LABELS = {
    "name": "Название",
    "category": "Категория",
    "description": "Описание",
    "website_url": "Сайт программы",
    "cabinet_url": "Кабинет партнёра",
    "login": "Логин",
    "payout_model": "Модель выплат",
    "payout_terms": "Условия выплат",
    "payout_min": "Минимальная выплата",
    "payout_method": "Способ выплаты",
    "notes": "Заметки",
    "title": "Подпись ссылки",
    "url": "Ссылка",
    "promo_code": "Промокод",
    "note": "Заметка",
}


class ValidationError(ValueError):
    """A bad request; `field` names the offending form field (for the UI to focus)."""

    def __init__(self, message: str, field: str = "") -> None:
        super().__init__(message)
        self.field = field


def _text(payload: dict[str, Any], key: str, *, max_len: int, required: bool = False,
          multiline: bool = False, field: str | None = None) -> str:
    value = payload.get(key, "")
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{FIELD_LABELS.get(key, key)}: ожидается текст", field or key)
    value = value.strip() if multiline else " ".join(value.split())
    if required and not value:
        raise ValidationError(f"{FIELD_LABELS.get(key, key)}: заполните поле", field or key)
    if len(value) > max_len:
        raise ValidationError(f"{FIELD_LABELS.get(key, key)}: не длиннее {max_len} символов", field or key)
    return value


def validate_url(value: str, label: str, field: str = "") -> str:
    """Empty is allowed (the caller decides whether the field is required)."""
    value = value.strip()
    if not value:
        return ""
    if len(value) > URL_MAX:
        raise ValidationError(f"{label}: слишком длинный адрес", field)
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc or any(c.isspace() for c in value):
        raise ValidationError(f"{label}: нужен адрес вида https://example.com", field)
    return value


def clean_tags(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list):
        raise ValidationError("Теги: ожидается список", "tags")
    tags: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValidationError("Теги: ожидается текст", "tags")
        tag = " ".join(item.split()).strip("#")
        if not tag:
            continue
        if len(tag) > TAG_MAX:
            raise ValidationError(f"Тег «{tag[:20]}…»: не длиннее {TAG_MAX} символов", "tags")
        if tag.casefold() not in {t.casefold() for t in tags}:
            tags.append(tag)
    if len(tags) > TAGS_MAX:
        raise ValidationError(f"Тегов не больше {TAGS_MAX}", "tags")
    return tags


def clean_status(value: Any) -> str:
    if value in (None, ""):
        return STATUS_ACTIVE
    if not isinstance(value, str) or value not in STATUSES:
        raise ValidationError("Статус: допустимо active, paused или archived", "status")
    return value


def clean_favorite(value: Any) -> bool:
    if value in (None, ""):
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ValidationError("Избранное: ожидается true или false", "favorite")


def clean_link(payload: Any, index: int) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError(f"Ссылка {index + 1}: ожидается объект", f"links.{index}.url")
    prefix = f"Ссылка {index + 1}: "
    url = payload.get("url", "")
    if url is None:
        url = ""
    if not isinstance(url, str):
        raise ValidationError(prefix + "адрес: ожидается текст", f"links.{index}.url")
    url = url.strip()
    if not url:
        raise ValidationError(prefix + "укажите адрес", f"links.{index}.url")
    url = validate_url(url, prefix + "адрес", f"links.{index}.url")
    return {
        "title": _text(payload, "title", max_len=SHORT_MAX, field=f"links.{index}.title"),
        "url": url,
        "promo_code": _text(payload, "promo_code", max_len=PROMO_MAX, field=f"links.{index}.promo_code"),
        "note": _text(payload, "note", max_len=SHORT_MAX * 3, field=f"links.{index}.note"),
    }


def clean_links(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValidationError("Ссылки: ожидается список", "links")
    if len(value) > LINKS_MAX:
        raise ValidationError(f"Ссылок не больше {LINKS_MAX}", "links")
    return [clean_link(item, i) for i, item in enumerate(value)]


def clean_program(payload: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not isinstance(payload, dict):
        raise ValidationError("Ожидается объект с полями программы")
    payout_model = _text(payload, "payout_model", max_len=SHORT_MAX)
    if payout_model and payout_model not in PAYOUT_MODELS:
        raise ValidationError("Модель выплат: выберите из списка", "payout_model")
    fields = {
        "name": _text(payload, "name", max_len=NAME_MAX, required=True),
        "category": _text(payload, "category", max_len=SHORT_MAX),
        "status": clean_status(payload.get("status")),
        "description": _text(payload, "description", max_len=TEXT_MAX, multiline=True),
        "website_url": validate_url(_text(payload, "website_url", max_len=URL_MAX), FIELD_LABELS["website_url"], "website_url"),
        "cabinet_url": validate_url(_text(payload, "cabinet_url", max_len=URL_MAX), FIELD_LABELS["cabinet_url"], "cabinet_url"),
        "login": _text(payload, "login", max_len=LOGIN_MAX),
        "payout_model": payout_model,
        "payout_terms": _text(payload, "payout_terms", max_len=TEXT_MAX, multiline=True),
        "payout_min": _text(payload, "payout_min", max_len=SHORT_MAX),
        "payout_method": _text(payload, "payout_method", max_len=SHORT_MAX),
        "tags": clean_tags(payload.get("tags")),
        "notes": _text(payload, "notes", max_len=TEXT_MAX, multiline=True),
        "favorite": clean_favorite(payload.get("favorite")),
    }
    return fields, clean_links(payload.get("links"))


def clean_patch(payload: Any) -> dict[str, Any]:
    """``PATCH``: only ``favorite`` and ``status`` may change."""
    if not isinstance(payload, dict):
        raise ValidationError("Ожидается объект")
    allowed = {"favorite", "status"}
    unknown = sorted(set(payload) - allowed)
    if unknown:
        raise ValidationError(f"PATCH меняет только favorite и status (лишнее: {', '.join(unknown)})")
    fields: dict[str, Any] = {}
    if "favorite" in payload:
        fields["favorite"] = clean_favorite(payload["favorite"])
    if "status" in payload:
        fields["status"] = clean_status(payload["status"])
    if not fields:
        raise ValidationError("Нечего менять: передайте favorite или status")
    return fields


def clean_timestamp(value: Any) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or value > 2**40:
        return None
    return int(value)
