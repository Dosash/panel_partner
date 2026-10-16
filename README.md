# Партнёрки — панель партнёрских программ

Небольшая веб-панель, в которой удобно хранить свои партнёрские программы: что программа делает,
ссылки на сайт и кабинет, реферальные ссылки с промокодами, условия и способ выплат, теги и заметки.
Один человек, один SQLite-файл, никаких внешних сервисов. Язык интерфейса — русский.

- **Обзор** — плитки (всего программ / активных / избранных / ссылок), недавно изменённые, разбивка по категориям.
- **Программы** — поиск по названию, описанию, тегам, ссылкам и промокодам; фильтры по категории, статусу
  и избранному; карточки или таблица.
- **Карточка программы** — всё о программе, ссылки с кнопками «Копировать» (ссылка и промокод) и «Открыть
  в новой вкладке», смена статуса, удаление с подтверждением.
- **Добавить / редактировать** — форма с динамическим списком ссылок (добавить, удалить, переставить);
  предупреждение, если уйти со страницы с несохранёнными правками.
- **Настройки** — экспорт и импорт JSON-бэкапа, тема оформления (системная / светлая / тёмная), версия.

> **Пароли в панели не храните.** Для доступа к кабинетам есть поле «Логин» — только логин или e-mail.
> Пароли держите в менеджере паролей. У панели нет собственной авторизации: не открывайте её в интернет
> без nginx с паролем или VPN.

## Стек

Python 3.13, [aiohttp](https://docs.aiohttp.org/), [aiosqlite](https://github.com/omnilib/aiosqlite)
(SQLite в режиме WAL, миграции через `PRAGMA user_version`), python-dotenv, [uv](https://docs.astral.sh/uv/)
для зависимостей, pytest. Фронтенд — обычный JavaScript без сборки (hash-роутинг, статика из
`app/static`), без внешних ресурсов: панель работает с `Content-Security-Policy: default-src 'self'`.

## Запуск локально

```bash
uv sync                 # создаёт .venv и ставит зависимости (включая pytest)
cp .env.example .env    # при необходимости поправьте порт и путь к базе
uv run python -m app    # http://127.0.0.1:8097/
```

База создаётся сама в `data/partners.db` (путь — `DB_PATH`), миграции применяются при каждом старте.

Тесты:

```bash
uv run pytest
```

## Запуск в Docker

```bash
cp .env.example .env
docker compose build partner-panel
docker compose up -d partner-panel
docker ps --filter name=partner-panel --format '{{.Names}} {{.Status}}'   # Up … (healthy)
```

Контейнер работает в сети хоста (`network_mode: host`) и слушает `WEB_HOST:WEB_PORT` из `.env`;
база — в томе `./data`. Healthcheck ходит на `<WEB_PREFIX>/api/health`.

Обновление: `docker compose build partner-panel && docker compose up -d partner-panel`.

## Переменные окружения (`.env`)

| Переменная | По умолчанию | Что значит |
|---|---|---|
| `WEB_HOST` | `127.0.0.1` | Адрес, который слушает панель. `0.0.0.0` — доступна из сети (только за nginx/VPN). |
| `WEB_PORT` | `8097` | Порт. |
| `WEB_PREFIX` | *(пусто)* | Путь, под которым панель открыта за прокси, например `/partners`. Пусто — в корне сайта. |
| `HUB_URL` | *(пусто)* | Ссылка «← Все панели» в меню, если панелей несколько (например `/`). Пусто — без ссылки. |
| `DB_PATH` | `data/partners.db` | Файл SQLite. В Docker переопределяется на `/app/data/partners.db`. |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR`. |

## За nginx с префиксом

Панель сама обслуживает всё под `WEB_PREFIX` — прокси **не должен** срезать префикс. Пример для
`https://partners.example.com/partners/` (панель слушает `127.0.0.1:8097`, в `.env` — `WEB_PREFIX=/partners`):

```nginx
server {
    listen 443 ssl;
    server_name partners.example.com;
    # … сертификаты …

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" always;

    location /partners/ {
        auth_basic "Partners";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://127.0.0.1:8097;      # без завершающего / — префикс остаётся в URI
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /partners { return 301 /partners/; }
}
```

Если панель одна и живёт в корне домена, `WEB_PREFIX` оставьте пустым и проксируйте `location /`.

## API

Всё под `<WEB_PREFIX>/api`, JSON, без авторизации (как и сама панель). Ошибки — `{"error": "…"}` по-русски,
у ошибок валидации ещё `"field"` с именем поля.

| Метод и путь | Что делает |
|---|---|
| `GET /api/health` | `{status, version, programs, links}` — для мониторинга и healthcheck |
| `GET /api/meta` | версия, `hub_url`, категории, теги, модели выплат, статусы |
| `GET /api/programs` | все программы со ссылками |
| `POST /api/programs` | создать (201) |
| `GET /api/programs/{id}` | одна программа |
| `PUT /api/programs/{id}` | заменить программу **и весь набор её ссылок** |
| `PATCH /api/programs/{id}` | изменить только `favorite` и/или `status` |
| `DELETE /api/programs/{id}` | удалить программу со ссылками |
| `GET /api/export` | JSON-файл со всеми данными |
| `POST /api/import` | добавить программы из такого файла; `{added, skipped, errors}` |

Поля программы: `name` (обязательно, до 200 символов), `category`, `status` (`active` / `paused` / `archived`),
`description`, `website_url`, `cabinet_url`, `login`, `payout_model` (`CPA`, `RevShare`, `CPL`, `CPS`, `Fix`,
`Гибрид`, `Другое`), `payout_terms`, `payout_min`, `payout_method`, `tags` (список), `notes`, `favorite`,
`links` — список `{title, url, promo_code, note}`. Адреса — только `http://` или `https://`; необязательные
адреса могут быть пустыми. Тело запроса — не больше 2 МБ.

Пример:

```bash
curl -X POST http://127.0.0.1:8097/api/programs -H 'Content-Type: application/json' -d '{
  "name": "Example Partners", "category": "Хостинг", "payout_model": "RevShare",
  "payout_terms": "40% RevShare пожизненно", "website_url": "https://partners.example.com",
  "tags": ["хостинг"], "links": [{"title": "Основная", "url": "https://example.com/?ref=abc", "promo_code": "PROMO2026"}]
}'
```

## Бэкап и восстановление

Два независимых способа:

1. **Экспорт JSON** — «Настройки → Экспорт» (или `GET /api/export`). Восстановление — «Настройки → Импорт»:
   программы из файла **добавляются** к существующим (ничего не удаляется и не сливается), поэтому в пустую
   базу импорт восстанавливает всё один в один, с датами создания.
2. **Копия файла базы** — остановите панель и скопируйте `data/partners.db` (вместе с `partners.db-wal`
   и `partners.db-shm`, если они есть), либо сделайте консистентную копию без остановки:

   ```bash
   sqlite3 data/partners.db ".backup 'backups/partners-$(date +%F).db'"
   ```

   Восстановление — положить файл обратно в `data/partners.db` при остановленной панели.

## Структура

```
app/__main__.py     запуск: конфиг, БД (+миграции), aiohttp-сервер
app/config.py       .env → Config (WEB_HOST, WEB_PORT, WEB_PREFIX, DB_PATH, HUB_URL)
app/db.py           схема SQLite, миграции, запросы
app/programs.py     валидация полей программы и ссылок
app/web/            aiohttp-приложение: api.py (JSON API), pages.py (index.html + редиректы), urls.py (префикс)
app/web/static/     index.html, app.js, style.css, favicon.svg — панель без сборки
tests/              pytest (API, префикс, конфиг, БД)
data/               база (создаётся сама; в git не попадает)
```

## Лицензия

MIT — см. [LICENSE](LICENSE).
