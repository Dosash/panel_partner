import pytest

from app.config import load_config, normalize_prefix


@pytest.mark.parametrize("raw, expected", [
    ("", ""), (None, ""), ("/", ""), ("partners", "/partners"), ("/partners/", "/partners"),
    ("//a//b/", "/a/b"),
])
def test_normalize_prefix(raw, expected):
    assert normalize_prefix(raw) == expected


def test_normalize_prefix_rejects_bad_segments():
    with pytest.raises(ValueError):
        normalize_prefix("/a b")
    with pytest.raises(ValueError):
        normalize_prefix("/api/../x")


def test_load_config_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv("WEB_HOST", "0.0.0.0")
    monkeypatch.setenv("WEB_PORT", "8097")
    monkeypatch.setenv("WEB_PREFIX", "partners/")
    monkeypatch.setenv("HUB_URL", "/")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "x.db"))
    c = load_config()
    assert (c.web_host, c.web_port, c.web_prefix, c.hub_url) == ("0.0.0.0", 8097, "/partners", "/")
    assert c.db_path.endswith("x.db")


def test_load_config_bad_port(monkeypatch):
    monkeypatch.setenv("WEB_PORT", "99999")
    with pytest.raises(ValueError):
        load_config()
