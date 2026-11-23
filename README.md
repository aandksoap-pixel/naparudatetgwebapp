# «Пространство для двоих»

Парный Telegram Mini App + Telegram-бот: Tinder-свайпы фильмов и еды, мэтчи, настроение в реальном времени, напоминания партнёру и PRO-подписка на двоих.

Стек: **React 18 + TypeScript + Vite + Tailwind + Framer Motion + @twa-dev/sdk** · **Fastify + grammY + Supabase (PostgreSQL, RLS, Realtime)** · оплата **Telegram Stars** и **ЮKassa/СБП**.

---

## Что умеет приложение

- **Авторизация через Telegram** — backend проверяет `initData` по HMAC-SHA256, без паролей и сторонних auth-сервисов.
- **Пара по ссылке** — `https://t.me/<bot>?startapp=join_PAIR_XXXXXX`; второй партнёр привязывается автоматически, первый получает уведомление в бота.
- **Свайпы**:
  - фильмы из TMDB на русском + локальный fallback из 50 фильмов;
  - 60+ карточек еды с фото, кухней и тегами;
  - взаимный лайк → мэтч, полноэкранная анимация, пуш обоим;
  - «Наши мэтчи» с отметкой «Выполнено».
- **Настроение** — 8 пресетов + свой статус до 40 символов; мгновенная синхронизация через Supabase Realtime; антиспам-пуш 15 минут.
- **Напоминания** — сейчас / через 30 мин / через час / своё время; бот присылает партнёру inline-кнопку «✅ Выполнено», отправителю — подтверждение.
- **Монетизация**:
  - FREE: 5 свайпов фильмов, 2 свайпа еды и 3 напоминания **на пару в сутки** (сброс в 00:00 МСК);
  - триал PRO на 2 дня один раз на пару;
  - PRO: 149 ₽/мес или 1 299 ₽/год, безлимит для обоих;
  - оплата Telegram Stars или картой/СБП через ЮKassa;
  - автоматическое отключение истёкшей подписки + мягкий пуш.
- **Темы Telegram** — тёмная/светлая, `themeParams`, безопасные зоны, тактильный отклик, адаптив от 320px.

---

## Структура проекта

```
.
├─ package.json                 # npm workspaces: backend + frontend
├─ supabase/
│  └─ schema.sql                # таблицы, индексы, RLS, RPC, Realtime
├─ backend/
│  ├─ src/server.ts             # точка входа, бот, планировщик
│  ├─ src/app.ts                # Fastify-приложение
│  ├─ src/config.ts             # валидация env (Zod)
│  ├─ src/lib/                  # initData, JWT, Supabase, даты, ошибки
│  ├─ src/services/             # state, pairs, swipes, mood, reminders, content, subscription
│  ├─ src/services/payments/    # Telegram Stars + ЮKassa
│  ├─ src/bot/                  # grammY: команды, callback, платежи, уведомления
│  ├─ src/routes/               # REST API + webhook + cron
│  ├─ src/data/                 # movies.json (50), food.json (60+)
│  └─ .env.example
├─ frontend/
│  ├─ src/App.tsx
│  ├─ src/context/AppContext.tsx
│  ├─ src/components/           # все экраны и модалки
│  ├─ src/components/tabs/      # 4 вкладки
│  └─ .env.example
├─ docs/BUILD_SPEC.md           # детальная спецификация и API-контракт
└─ README.md
```

---

## Быстрый старт (локально)

Нужны Node.js 20+ и npm 10+.

```bash
npm install
cp backend/.env.example backend/.env       # Windows: copy backend\.env.example backend\.env
cp frontend/.env.example frontend/.env     # Windows: copy frontend\.env.example frontend\.env
# заполните backend/.env
npm run dev
```

- backend: `http://localhost:3000` (health — `/api/health`)
- frontend: `http://localhost:5173`
- для теста Mini App нужен HTTPS-туннель (например, `cloudflared tunnel --url http://localhost:5173`), потому что Telegram открывает только HTTPS.

### 1. Создайте бота в BotFather

1. `/newbot` → имя и username.
2. Сохраните токен в `TELEGRAM_BOT_TOKEN`, username — в `TELEGRAM_BOT_USERNAME` (без `@`).
3. `/newapp` → выберите бота → укажите название, описание, иконку и **Web App URL**. Для локальной разработки можно поставить HTTPS-адрес туннеля, для продакшена — URL фронтенда на Vercel/Cloudflare Pages.
4. Там же включите **Main Mini App** (Menu Button), если хотите кнопку в профиле бота.
5. В `TELEGRAM_WEBHOOK_SECRET` задайте произвольную длинную строку.

### 2. Создайте Supabase-проект

1. [supabase.com](https://supabase.com) → New project (Free tier).
2. SQL Editor → вставьте целиком `supabase/schema.sql` → Run. Скрипт создаёт таблицы, RLS, RPC, включает Realtime.
3. Project Settings → API:
   - `SUPABASE_URL` — Project URL;
   - `SUPABASE_ANON_KEY` — anon/public key;
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (**только backend, никогда не во фронтенде**).
4. Project Settings → API → JWT Settings → **Legacy JWT secret** → `SUPABASE_JWT_SECRET`. Он нужен, чтобы backend выпускал короткоживущий JWT для Realtime с RLS. Если проект уже переведён на новые signing keys и legacy secret скрыт — включите/скопируйте legacy secret в настройках JWT.

> Клиент не пишет в Supabase напрямую: все изменения идут через backend с `service_role`. Realtime использует JWT с claim `pair_id`, RLS отдаёт только данные своей пары.

### 3. Заполните backend/.env

Минимум:

```env
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173,https://web.telegram.org
TELEGRAM_BOT_TOKEN=123456:AA...
TELEGRAM_BOT_USERNAME=my_pair_bot
MINI_APP_URL=https://your-tunnel.trycloudflare.com
BOT_MODE=polling
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
PAYMENT_SIGNING_SECRET=длинная-случайная-строка
STARS_MONTHLY=85
STARS_YEARLY=750
PRICE_MONTHLY_RUB=149
PRICE_YEARLY_RUB=1299
ENABLE_INTERNAL_CRON=true
```

Полный список с комментариями — в `backend/.env.example`.

### 4. Заполните frontend/.env

```env
VITE_API_URL=http://localhost:3000
```

Для продакшена — публичный URL backend без слэша на конце.

---

## Деплой за 0 ₽

Схема: **Supabase Free** + **Render Free** (backend) + **Vercel/Cloudflare Pages Free** (frontend) + **cron-job.org Free** (пробуждение cron).

### 1. Frontend — Vercel или Cloudflare Pages

**Vercel:**
1. New Project → импортируйте репозиторий.
2. Root Directory: `frontend`.
3. Build Command: `npm run build`; Output Directory: `dist`.
4. Environment Variable: `VITE_API_URL=https://<backend>.onrender.com`.
5. Deploy. Скопируйте URL — это `MINI_APP_URL` и Web App URL в BotFather.

**Cloudflare Pages:**
1. Create project → подключите Git.
2. Build command: `npm run build`; output: `dist`; root: `frontend`.
3. Переменная `VITE_API_URL`.
4. `frontend/public/_redirects` уже содержит SPA-fallback.

### 2. Backend — Render Free

1. New → Web Service → репозиторий.
2. Root Directory: `backend`.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Environment: все переменные из `backend/.env.example`. Обязательно:
   - `NODE_ENV=production`
   - `BOT_MODE=webhook`
   - `TELEGRAM_WEBHOOK_SECRET` — та же строка, что передаётся Telegram;
   - `MINI_APP_URL` — URL фронтенда;
   - `CORS_ORIGINS=https://<frontend-domain>,https://web.telegram.org`
   - `CRON_SECRET` — длинная случайная строка.
6. После деплоя backend при старте сам вызовет `setWebhook` на `https://<backend>.onrender.com/webhook/telegram` с секретом.
7. Проверьте `https://<backend>.onrender.com/api/health`.

> Render Free «засыпает» после 15 минут без запросов. Для напоминаний нужен внешний пинг.

### 3. Cron на бесплатном тарифе

Зарегистрируйтесь на [cron-job.org](https://cron-job.org) (бесплатно) и создайте задачу:

- URL: `https://<backend>.onrender.com/api/cron/tick`
- Method: `POST`
- Header: `X-Cron-Secret: <CRON_SECRET>`
- Schedule: **каждую минуту**
- Timeout: 30 секунд

Это одновременно будит backend, отправляет отложенные напоминания и раз в час проверяет истёкшие подписки. Внутренний `setInterval` тоже работает, но на Free-инстансе он останавливается при засыпании — внешний cron надёжнее.

Бесплатных 750 часов Render хватает на один сервис 24/7. Supabase Free может усыплять неактивные проекты — раз в несколько дней открывайте дашборд или сделайте лёгкий пинг, если это критично.

### 4. Telegram

1. BotFather → `/setmenubutton` или настройки Mini App → URL фронтенда.
2. Проверьте вход: откройте бота → кнопка «Открыть пространство».
3. Пригласите второго человека ссылкой из приложения.
4. Для теста оплаты Stars: используйте тестовые звёзды, если они доступны вашему аккаунту; реальные платежи списываются с баланса Telegram.

---

## Оплата

### Telegram Stars

- Цены в звёздах: `STARS_MONTHLY`, `STARS_YEARLY`.
- Backend создаёт invoice link через `createInvoiceLink` с `currency: "XTR"`; frontend открывает `WebApp.openInvoice`.
- `pre_checkout_query` и `successful_payment` проверяют HMAC-подпись payload, план, валюту и сумму.
- Для цифровых товаров Telegram Stars не требует provider token. Убедитесь, что бот соответствует правилам Telegram для цифровых товаров.

### ЮKassa / СБП

1. Создайте магазин в [ЮKassa](https://yookassa.ru), получите `shopId` и секретный ключ.
2. Заполните:
   ```env
   YOOKASSA_SHOP_ID=...
   YOOKASSA_SECRET_KEY=...
   YOOKASSA_RETURN_URL=https://t.me/<bot_username>?startapp=payment_success
   ```
3. В личном кабинете ЮKassa укажите HTTP-уведомления:
   `https://<backend>.onrender.com/webhook/yookassa`
   События: `payment.succeeded`, `payment.canceled`.
4. Webhook **не доверяет телу запроса**: backend перепроверяет платёж через `GET /v3/payments/{id}`, сверяет metadata, сумму и валюту, затем идемпотентно активирует подписку.
5. Пока webhook не пришёл, frontend опрашивает `/api/subscription/sync`.

Если ЮKassa не настроена, кнопка карты вернёт понятную ошибку — Stars продолжит работать.

---

## API (кратко)

Все защищённые запросы: заголовок `X-Telegram-Init-Data: <WebApp.initData>`.

```
POST /api/session
GET  /api/state
POST /api/pair/create | /api/pair/join | /api/pair/leave
PATCH /api/profile | /api/pair/date
POST /api/mood
POST /api/swipes
PATCH /api/matches/:id
POST /api/reminders
POST /api/reminders/:id/done
POST /api/subscription/trial | /stars-invoice | /yookassa | /sync
GET  /api/content/movies | /api/content/food
GET  /api/health
POST /api/cron/tick
POST /webhook/telegram | /webhook/yookassa
```

Полные схемы, коды ошибок и бизнес-правила — в `docs/BUILD_SPEC.md`.

---

## Безопасность

- `initData` проверяется HMAC-SHA256 с токеном бота; просроченные данные отклоняются.
- `service_role` и JWT-секрет живут только на backend.
- RLS: клиент видит только строки своей пары; запись через anon невозможна.
- Realtime JWT живёт 2 часа и содержит только `telegram_id` + `pair_id`.
- Идемпотентность платежей: уникальный `(provider, provider_payment_id)`, повторный webhook не продлевает подписку дважды.
- Rate limit, helmet, ограничение размера JSON, CORS allowlist.
- Cron защищён отдельным секретом, сравнение timing-safe.
- Триал — один раз на пару, лимиты атомарны в SQL (без гонок при одновременных свайпах).

---

## Полезные команды

```bash
npm run dev             # backend + frontend одновременно
npm run typecheck       # tsc --noEmit в обоих workspace
npm run build           # сборка backend и frontend
npm run dev:backend
npm run dev:frontend
npm start               # backend из dist
```

Проверка SQL: выполните `supabase/schema.sql` в SQL Editor. Повторный запуск безопасен для таблиц/функций, но не удаляет данные.

---

## Диагностика

| Симптом | Что проверить |
|---|---|
| «Откройте через Telegram» | приложение открыто не через Telegram или скрипт `telegram-web-app.js` не загрузился |
| 401 `INVALID_INIT_DATA` | токен бота в backend не совпадает с ботом, из которого открыт Mini App; истёк `auth_date` |
| Realtime не обновляет | `SUPABASE_JWT_SECRET` не legacy secret; SQL не выполнен; frontend получил старый токен после создания пары |
| Бот не присылает пуши | пользователь не нажал `/start` у бота; проверьте логи `sendMessage` (403 — бот заблокирован) |
| Напоминания не приходят | Render спит; cron-job.org не настроен/неверный `CRON_SECRET` |
| Stars invoice не создаётся | неверные `STARS_*`, бот не настроен, сумма не целое число |
| ЮKassa не активирует | неверный shopId/secret, webhook URL, `YOOKASSA_RETURN_URL`; смотрите `/api/subscription/sync` и логи |
| Фото не грузятся | внешние URL заблокированы; UI покажет градиентный fallback |

---

## Лицензия и ограничения

Проект использует бесплатные тарифы Supabase/Render/Vercel и TMDB API. Для коммерческой эксплуатации проверьте условия TMDB, Unsplash, Telegram Payments и ЮKassa. Постеры фильмов загружаются с TMDB CDN; fallback-постеры рисуются CSS без внешних ассетов.
