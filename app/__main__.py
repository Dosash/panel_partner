"""Entry point: ``python -m app`` — opens the database (runs migrations) and serves the panel."""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys

from aiohttp import web

from app import __version__
from app.config import Config, load_config
from app.db import Database
from app.web import create_web_app

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"
log = logging.getLogger("app")


async def run(config: Config) -> None:
    db = Database(config.db_path)
    await db.connect()
    runner = web.AppRunner(create_web_app(db, config), access_log=None)
    await runner.setup()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # pragma: no cover - Windows
            pass
    try:
        await web.TCPSite(runner, config.web_host, config.web_port).start()
        log.info("Панель «Партнёрки» v%s: http://%s:%s%s/ (БД: %s)",
                 __version__, config.web_host, config.web_port, config.web_prefix, config.db_path)
        await stop.wait()
    finally:
        log.info("Остановка…")
        await runner.cleanup()
        await db.close()


def main() -> int:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=level if level in ("DEBUG", "INFO", "WARNING", "ERROR") else "INFO", format=LOG_FORMAT)
    try:
        config = load_config()
    except ValueError as exc:
        log.error("Ошибка конфигурации: %s", exc)
        return 2
    try:
        asyncio.run(run(config))
    except OSError as exc:
        log.error("Не удалось запустить сервер на %s:%s: %s", config.web_host, config.web_port, exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
