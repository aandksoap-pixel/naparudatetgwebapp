# НаПару — живая демо-версия и текущее состояние

## Что открыть

- **Бот:** [@naparulove_bot](https://t.me/naparulove_bot)
- **Mini App:** https://6l8wcg-ip-80-246-226-202.tunnelmole.net
- **Supabase:** проект `naparu-miniapp`, регион Tokyo (`cjvzegooummpbhxoebyl`)
- **Backend health:** https://6l8wcg-ip-80-246-226-202.tunnelmole.net/api/health

Откройте бота → **«Открыть пространство»** или кнопку меню. Внутри:
1. «Создать пространство» — появится код и ссылка.
2. Отправьте ссылку партнёру или дайте код: `PAIR_XXXXXX`.
3. Партнёр открывает ссылку (авто-вступление) или вводит код вручную.
4. Дальше — свайпы, настроение, напоминания, профиль и PRO.

## Что уже настроено

- Токен бота и username в `backend/.env`.
- Команды `/start`, `/help`; описание и short description бота.
- Web App menu button указывает на публичный frontend.
- Supabase: схема `supabase/schema.sql` применена, таблицы/RPC/RLS/Realtime созданы.
- `service_role` получил явные SQL-привилегии (в схеме и отдельным GRANT).
- Realtime: создан и активирован HS256 signing key, backend подписывает JWT с `kid`.
- Проверено на живом Supabase:
  - `POST /api/session` и автосоздание пользователя;
  - создание пары и invite-ссылки;
  - 5 фильмов → 6-й возвращает `LIMIT_REACHED`;
  - триал снимает лимит;
  - RLS-запрос с Realtime-JWT возвращает только своего пользователя;
  - Realtime `postgres_changes` доставляет событие `UPDATE` по паре;
  - `GET /api/health` → `{ ok: true, db: true }`.
- Тестовые пользователи удалены, база пустая.

## Как это запущено сейчас

На этом компьютере работают три процесса:

1. **Backend** — `npm run dev --workspace backend`, порт `3000`, режим polling.
2. **Публичный прокси** — `node serve-public.mjs`, порт `5173`: отдаёт `frontend/dist` и проксирует `/api` и `/webhook` на backend. Один HTTPS-туннель обслуживает и frontend, и API (same-origin).
3. **Tunnelmole** — `npx tunnelmole 5173`, публичный HTTPS-адрес.

Проверить процессы:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen
Get-Process node,ssh
```

Остановить демо:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Ограничение демо

Tunnelmole — бесплатный временный туннель:

- URL живёт, пока запущены процессы и этот компьютер;
- после перезапуска URL может измениться;
- для Telegram нужен HTTPS — туннель его даёт.

После смены URL нужно:
1. обновить `MINI_APP_URL` и `CORS_ORIGINS` в `backend/.env`;
2. перезапустить backend (он заново выставит menu button и будет отдавать новые invite-ссылки);
3. frontend пересобирать не нужно, если `VITE_API_URL` пуст (same-origin через прокси).

## Постоянный деплой (рекомендуется)

1. **Frontend** → Vercel или Cloudflare Pages:
   - Root: `frontend`; build: `npm run build`; output: `dist`;
   - env: `VITE_API_URL=https://<backend-domain>`.
2. **Backend** → Render/Railway/Fly:
   - Root: `backend`; build: `npm install && npm run build`; start: `npm start`;
   - env из `backend/.env.example`; `BOT_MODE=webhook`, `PUBLIC_BASE_URL=https://<backend-domain>`;
   - `CORS_ORIGINS=https://<frontend-domain>,https://web.telegram.org`.
3. **Telegram** → BotFather:
   - `/newapp` для @naparulove_bot, URL = frontend;
   - menu button можно оставить (backend обновит его при старте).
4. **Cron** → cron-job.org каждую минуту:
   - `POST https://<backend-domain>/api/cron/tick`
   - header `X-Cron-Secret: <CRON_SECRET>`.
5. **ЮKassa** (опционально) → webhook `https://<backend-domain>/webhook/yookassa`.

## Секреты

Секреты лежат только в `backend/.env` и `frontend/.env` (gitignored). В чат были отправлены токен бота и Supabase PAT — после настройки их желательно перевыпустить:

- BotFather → `/revoke` → новый токен → `TELEGRAM_BOT_TOKEN`;
- Supabase → Account → Access Tokens → отозвать использованный PAT;
- Supabase secret key при необходимости перевыпустить в Project Settings → API Keys.

PAT нужен был только для выполнения SQL и настройки signing key. Для работы приложения он не используется.

## Supabase JWT (важно для повторного деплоя)

В новом Supabase-проекте JWT-ключ по умолчанию асимметричный (ES256). Значение вида UUID — это **ID ключа**, а не секрет. В этом проекте сделан отдельный HS256 signing key:

- `SUPABASE_JWT_SECRET` — секрет HS256-ключа;
- `SUPABASE_JWT_KID` — UUID ключа (kid в заголовке JWT).

Если проект пересоздаётся:
1. создайте/импортируйте HS256 signing key в Supabase → JWT Signing Keys;
2. переведите его в `in_use`;
3. положите секрет и kid в `.env`;
4. перезапустите backend.

Либо используйте Legacy JWT Secret (если он доступен): тогда `SUPABASE_JWT_SECRET` = legacy secret, `SUPABASE_JWT_KID` можно оставить пустым.
