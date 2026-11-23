# Деплой Cloudflare Pages + Render

## Что исправлено в репозитории

Cloudflare собирал проект из корня и искал `dist` в корне, а Vite клал файлы в `frontend/dist`. Теперь корневой `npm run build`:

1. собирает backend и frontend;
2. копирует `frontend/dist` → `dist` (скрипт `scripts/collect-dist.mjs`).

Дополнительно добавлен `functions/api/[[path]].js`: Cloudflare Pages проксирует все `/api/*` на backend. Frontend использует относительный `/api`, поэтому:

- не нужен CORS;
- не нужно пересобирать frontend при смене backend-домена;
- `BACKEND_URL` задаётся в настройках Cloudflare Pages.

## Cloudflare Pages

1. Settings → Build & deployments:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: пусто (корень репозитория)
2. Settings → Environment variables:
   - `BACKEND_URL` = публичный URL backend, например `https://naparu-backend.onrender.com`
3. Пересоберите проект. В логе должно быть:
   - `frontend/dist` build;
   - `[collect-dist] frontend/dist -> dist`;
   - `Validating asset output directory` без ошибки.
4. После деплоя откройте `https://<project>.pages.dev` — должен загрузиться экран «Откройте приложение через Telegram».

## Backend на Render

В корне есть `render.yaml` (Blueprint, free, Singapore). В Render:

1. New → Blueprint → выберите GitHub-репозиторий.
2. Render создаст `naparu-backend` и попросит заполнить секреты (`sync: false`):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_KID`, `PAYMENT_SIGNING_SECRET`, `CRON_SECRET`.
3. После деплоя задайте:
   - `PUBLIC_BASE_URL=https://naparu-backend.onrender.com`
   - `MINI_APP_URL=https://<project>.pages.dev`
   - `CORS_ORIGINS=https://<project>.pages.dev,https://web.telegram.org`
4. Проверьте `https://naparu-backend.onrender.com/api/health`.
5. В Cloudflare Pages обновите `BACKEND_URL` на этот адрес.

Render Free засыпает. Для cron создайте задачу на cron-job.org:

- `POST https://naparu-backend.onrender.com/api/cron/tick`
- header `X-Cron-Secret: <CRON_SECRET>`
- каждую минуту.

## Telegram

После Cloudflare-деплоя:

1. BotFather → `/setmenubutton` или настройки Mini App → URL Cloudflare.
2. Обновите `MINI_APP_URL` на backend и перезапустите его — бот выставит menu button сам.
3. Проверьте invite-ссылку: `https://t.me/naparulove_bot?startapp=join_PAIR_XXXXXX`.

## Оплата

Оставлена **только Telegram Stars** (`XTR`, 85/750 звёзд). ЮKassa/СБП удалены из UI, API, конфига и webhook'ов. Для Stars не нужен provider token.

## Производительность

- `buildState` выполняет независимые запросы параллельно;
- дата Москвы считается локально, без лишнего RPC;
- уведомления бота о мэтче/настроении/триале не блокируют HTTP-ответ;
- свайп в UI применяется оптимистично: карточка исчезает сразу, запросы уходят в последовательную очередь;
- вторая категория (еда/фильмы) подгружается заранее;
- убраны лишние ре-рендеры и ожидание сети на кнопках.

## UI

- «Подробнее» на карточке открывает полноэкранную/шторочную карточку с полным описанием.
- Фильтры по жанрам фильмов и тегам еды (чипы под переключателем категорий).
- Для еды добавлены калории, время приготовления, порция, острота, сочетания и расширенное описание.
