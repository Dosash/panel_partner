"""Password hashing, login sessions and the brute-force guard (no aiohttp here).

The password is optional: when `PASSWORD_SETTING` is absent the panel is open. Only a scrypt
hash is stored (``scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>``); a session is a random token
(`new_session_token`) of which the database keeps the sha256 (`token_hash`).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from collections import deque
from dataclasses import dataclass, field

PASSWORD_MIN = 8
PASSWORD_MAX = 128
SESSION_TTL = 30 * 24 * 3600  # seconds

SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16

LOGIN_ATTEMPTS = 5
LOGIN_WINDOW = 10 * 60  # seconds


class PasswordError(ValueError):
    """A password that cannot be set (too short / too long / not a string)."""


def check_new_password(value: object) -> str:
    if not isinstance(value, str):
        raise PasswordError("Пароль: ожидается строка")
    if len(value) < PASSWORD_MIN:
        raise PasswordError(f"Пароль: не короче {PASSWORD_MIN} символов")
    if len(value) > PASSWORD_MAX:
        raise PasswordError(f"Пароль: не длиннее {PASSWORD_MAX} символов")
    return value


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt if salt is not None else secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(stored: str | None, password: object) -> bool:
    """Constant-time check; False for a missing / malformed hash or a non-string password."""
    if not stored or not isinstance(password, str):
        return False
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass
class LoginGuard:
    """At most `attempts` wrong passwords per client key within `window` seconds (in memory)."""

    attempts: int = LOGIN_ATTEMPTS
    window: int = LOGIN_WINDOW
    _failures: dict[str, deque[float]] = field(default_factory=dict)

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._failures.setdefault(key, deque())
        while q and q[0] <= now - self.window:
            q.popleft()
        if not q:
            self._failures.pop(key, None)
        return q

    def retry_after(self, key: str, now: float | None = None) -> int:
        """Seconds until the key may try again (0 = allowed now)."""
        current = now if now is not None else time.monotonic()
        q = self._prune(key, current)
        if len(q) < self.attempts:
            return 0
        return max(1, int(q[0] + self.window - current) + 1)

    def failure(self, key: str, now: float | None = None) -> None:
        current = now if now is not None else time.monotonic()
        self._prune(key, current)
        self._failures.setdefault(key, deque()).append(current)

    def success(self, key: str) -> None:
        self._failures.pop(key, None)
