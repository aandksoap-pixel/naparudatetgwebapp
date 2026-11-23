# «Пространство для двоих» — спецификация сборки

Этот документ — единый контракт для backend- и frontend-частей. Код должен быть готов к продакшену: без `TODO`, без заглушек, с обработкой ошибок, валидацией и мобильной адаптацией.

## 0. Продукт

Парный Telegram Mini App + Telegram-бот. Пара синхронизируется по invite-ссылке. Внутри 4 вкладки:

1. **Свайпы** — фильмы (TMDB + fallback 50 фильмов) и еда (локальные 60+ карточек). Tinder-механика. Взаимный лайк → мэтч + уведомление в бот.
2. **Настроение** — 8 пресетов + кастомный текст до 40 символов, Realtime, антиспам-пуш 1 раз в 15 минут.
3. **Напоминания** — быстрый текст, пресеты, отправка сейчас / через 30 мин / 1 час / своё время. Бот присылает получателю inline-кнопку «✅ Выполнено», отправителю — уведомление о выполнении.
4. **Профиль и подписка** — имя, дата начала отношений, тариф, отвязка пары.

Монетизация: одна подписка на пару. FREE-лимиты **на пару в сутки** (сброс в 00:00 МСК): фильмы 5 свайпов, еда 2 свайпа, напоминания 3. Триал 2 дня один раз на пару. PRO: 149 ₽/мес или 1 299 ₽/год. Оплата: Telegram Stars (`XTR`) и ЮKassa/СБП. Paywall появляется при попытке превысить лимит.

## 1. Структура репозитория (уже созданы пустые каталоги)

```
space-for-two/
├─ package.json                 # npm workspaces (backend + frontend)
├─ .gitignore
├─ README.md                    # пишет lead
├─ docs/BUILD_SPEC.md           # этот файл
├─ supabase/schema.sql          # пишет lead
├─ backend/                     # пишет backend-agent
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ .env.example
│  └─ src/
│     ├─ server.ts
│     ├─ app.ts
│     ├─ config.ts
│     ├─ types.ts
│     ├─ lib/{supabase,telegram-auth,jwt,moscow,errors,validation,html}.ts
│     ├─ data/{movies.json,food.json}
│     ├─ services/{state,pairs,swipes,mood,reminders,content,subscription,notifications}.ts
│     ├─ services/payments/{telegram-stars,yookassa}.ts
│     ├─ bot/{bot,handlers}.ts
│     ├─ jobs.ts
│     └─ routes/{session,state,pair,profile,mood,swipes,matches,reminders,content,subscription,payments,cron,webhooks,index}.ts
└─ frontend/                    # пишет frontend-agent
   ├─ package.json
   ├─ tsconfig.json
   ├─ tsconfig.node.json
   ├─ vite.config.ts
   ├─ tailwind.config.ts
   ├─ postcss.config.js
   ├─ index.html
   ├─ .env.example
   ├─ public/_redirects
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ index.css
      ├─ vite-env.d.ts
      ├─ types/api.ts
      ├─ lib/{api,telegram,haptics,format}.ts
      ├─ context/{AppContext,ToastContext}.tsx
      ├─ hooks/{useRealtime,useInterval}.ts
      └─ components/
         ├─ ErrorBoundary.tsx
         ├─ LoadingScreen.tsx
         ├─ Modal.tsx
         ├─ Avatar.tsx
         ├─ HeaderPair.tsx
         ├─ BottomNav.tsx
         ├─ OnboardingPair.tsx
         ├─ LimitMeter.tsx
         ├─ PaywallModal.tsx
         ├─ MatchModal.tsx
         ├─ MatchesSheet.tsx
         ├─ SwipeDeck.tsx
         ├─ SwipeCard.tsx
         └─ tabs/{SwipesTab,MoodTab,RemindersTab,ProfileTab}.tsx
```

Не менять файлы другой зоны (`backend/` — backend-agent, `frontend/` — frontend-agent, `README.md`, `supabase/`, `docs/` — lead). Не создавать `.env` с секретами.

## 2. Технологические версии

- Backend: Node 20+, TypeScript 5.x, Fastify 4.x, grammY 1.x, `@supabase/supabase-js` 2.x, Zod, `jsonwebtoken`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/sensible` (optional). ESM (`"type": "module"`), сборка `tsc`, dev через `tsx watch`. Тестовых фреймворков не требуется, но typecheck/build обязаны проходить.
- Frontend: React 18, TypeScript 5.x, Vite 5, Tailwind CSS 3.4, Framer Motion 11, `@twa-dev/sdk`, `@supabase/supabase-js` 2.x. Без react-router: один экран с табами. Без тяжёлых UI-kit.
- Не использовать `any` без необходимости. `strict: true`. Не подавлять ошибки `@ts-ignore`; допустим `@ts-expect-error` только с пояснением, лучше без него.

## 3. Аутентификация

Все запросы frontend → backend (кроме webhook/cron/health) содержат заголовок:

```
X-Telegram-Init-Data: <window.Telegram.WebApp.initData>
```

Backend обязан валидировать `initData` по HMAC-SHA256:
`secret = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)`, затем HMAC над отсортированной data-check-string. Сравнение timing-safe. Проверять `auth_date` (не старше `INIT_DATA_MAX_AGE_SECONDS`, по умолчанию 86400). Из поля `user` брать `id`, `username`, `first_name`, `last_name`, `photo_url`. Ошибка: 401 `INVALID_INIT_DATA` / `INIT_DATA_EXPIRED`.

**Realtime-доступ:** backend выпускает Supabase-совместимый JWT (`HS256`, `SUPABASE_JWT_SECRET`) с claims:
`{ role: "authenticated", aud: "authenticated", sub: String(userId), telegram_id: String(userId), pair_id: pairId ?? null, iat, exp }`, срок 2 часа.
Frontend использует `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` только для Realtime и вызывает `supabase.realtime.setAuth(token)`.

## 4. Формат ошибок

```json
{ "error": { "code": "LIMIT_REACHED", "message": "Дневной лимит исчерпан", "details": { "category": "movie", "limit": 5 } } }
```

HTTP-коды: 400 `VALIDATION_ERROR`/`INVALID_DATE`/`INVALID_MOOD`, 401 `INVALID_INIT_DATA`/`INIT_DATA_EXPIRED`, 403 `NO_PAIR`/`NOT_PAIR_MEMBER`, 404 `PAIR_NOT_FOUND`/`REMINDER_NOT_FOUND`/`MATCH_NOT_FOUND`, 409 `PAIR_FULL`/`ALREADY_IN_PAIR`/`OWN_PAIR`/`TRIAL_USED`/`LIMIT_REACHED`/`PAYMENT_CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

Backend превращает ошибки PostgreSQL (сообщения `LIMIT_REACHED`, `TRIAL_USED`, `PAIR_FULL`, `ALREADY_IN_PAIR`, `OWN_PAIR`, `NO_PAIR`, `NOT_REMINDER_RECEIVER`, `PAIR_NOT_FOUND`, `REMINDER_NOT_FOUND`, `MATCH_NOT_FOUND`, `INVALID_*`) в эти коды, не отдавая клиенту SQL-текст.

## 5. API-контракт (JSON camelCase)

Базовый URL: `VITE_API_URL` (без слэша на конце) + `/api`. Все ответы JSON.

### 5.1 Типы (`frontend/src/types/api.ts`)

```ts
export type PlanType = 'free' | 'trial' | 'pro_monthly' | 'pro_yearly';
export type Category = 'movie' | 'food';
export type MoodStatus = 'hugs' | 'tired' | 'snack' | 'playful' | 'stressed' | 'chill' | 'adventure' | 'miss';

export interface UserProfile {
  id: number;
  username: string | null;
  firstName: string;
  avatarUrl: string | null;
  moodStatus: MoodStatus;
  moodText: string | null;
  moodUpdatedAt: string;
}
export interface PairInfo {
  id: string;
  inviteCode: string;
  inviteLink: string;
  relationshipStartDate: string | null; // YYYY-MM-DD
  planType: PlanType;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  paidByUserId: number | null;
  createdAt: string;
  daysTogether: number | null;
}
export interface SubscriptionInfo {
  plan: PlanType;
  isPro: boolean;
  isTrial: boolean;
  trialUsed: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
}
export interface UsageInfo {
  date: string;
  movieSwipesCount: number;
  foodSwipesCount: number;
  remindersSentCount: number;
}
export interface LimitInfo { used: number; limit: number | null; }
export interface LimitsInfo {
  isUnlimited: boolean;
  movie: LimitInfo;
  food: LimitInfo;
  reminders: LimitInfo;
}
export interface MatchInfo {
  id: string;
  category: Category;
  itemId: string;
  itemTitle: string;
  itemPoster: string;
  isCompleted: boolean;
  createdAt: string;
  completedAt: string | null;
}
export interface ReminderInfo {
  id: string;
  senderId: number;
  receiverId: number;
  text: string;
  remindAt: string;
  isSent: boolean;
  isDone: boolean;
  createdAt: string;
  sentAt: string | null;
  doneAt: string | null;
}
export interface MovieCard {
  id: string; // tmdb_<id>
  category: 'movie';
  title: string;
  originalTitle: string | null;
  overview: string;
  poster: string; // пустая строка => styled fallback
  year: number | null;
  rating: number;
  genres: string[];
}
export interface FoodCard {
  id: string;
  category: 'food';
  title: string;
  cuisine: string;
  tags: string[];
  description: string;
  photo: string;
  emoji: string;
}
export type SwipeItem = MovieCard | FoodCard;

export interface AppState {
  user: UserProfile;
  partner: UserProfile | null;
  pair: PairInfo | null;
  subscription: SubscriptionInfo;
  limits: LimitsInfo;
  usage: UsageInfo;
  matches: MatchInfo[];
  reminders: ReminderInfo[];
  mySwipes: { movie: string[]; food: string[] };
  serverTime: string;
}
export interface RealtimeCredentials { url: string; anonKey: string; token: string; }
export interface PublicConfig {
  botUsername: string;
  miniAppUrl: string;
  trialDays: number;
  prices: { monthlyRub: number; yearlyRub: number; starsMonthly: number; starsYearly: number };
}
export interface SessionResponse {
  state: AppState;
  realtime: RealtimeCredentials;
  config: PublicConfig;
  notice?: string;
}
```

### 5.2 Эндпоинты

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/api/session` | `{}` | `SessionResponse`; инициализирует/обновляет пользователя и обрабатывает `start_param` из initData |
| GET | `/api/state` | — | `AppState` |
| POST | `/api/pair/create` | `{}` | `{ state: AppState }` |
| POST | `/api/pair/join` | `{ inviteCode: string }` | `{ state: AppState }` |
| POST | `/api/pair/leave` | `{}` | `{ state: AppState }` |
| PATCH | `/api/profile` | `{ displayName: string }` | `{ state: AppState }` |
| PATCH | `/api/pair/date` | `{ relationshipStartDate: string \| null }` | `{ state: AppState }` |
| POST | `/api/mood` | `{ moodStatus: MoodStatus; moodText: string \| null }` | `{ state: AppState; notifiedPartner: boolean }` |
| POST | `/api/swipes` | `{ category: Category; itemId: string; itemTitle: string; itemPoster?: string; direction: 'left' \| 'right' }` | `{ state, match: MatchInfo \| null, isMatch: boolean, newMatch: boolean }` |
| PATCH | `/api/matches/:id` | `{ isCompleted: boolean }` | `{ state: AppState }` |
| POST | `/api/reminders` | `{ text: string; remindAt?: string \| null }` | `{ state: AppState; reminder: ReminderInfo }` |
| POST | `/api/reminders/:id/done` | `{}` | `{ state: AppState; reminder: ReminderInfo }` |
| POST | `/api/subscription/trial` | `{}` | `{ state: AppState }` |
| POST | `/api/subscription/stars-invoice` | `{ plan: 'monthly' \| 'yearly' }` | `{ invoiceLink: string }` |
| POST | `/api/subscription/yookassa` | `{ plan: 'monthly' \| 'yearly' }` | `{ confirmationUrl: string; paymentId: string }` |
| POST | `/api/subscription/sync` | `{}` | `{ state: AppState; pending: boolean }` |
| GET | `/api/content/movies?limit=30` | — | `{ items: MovieCard[]; source: 'tmdb' \| 'fallback' }` |
| GET | `/api/content/food?limit=30` | — | `{ items: FoodCard[]; source: 'local' }` |
| GET | `/api/health` | — | `{ ok: true, db: true, uptime: number }` |
| POST | `/api/cron/tick` | header `X-Cron-Secret` | `{ ok, remindersClaimed, subscriptionsExpired }` |

Публичные (без Telegram auth): `/api/health`, `/api/cron/tick`, `/webhook/telegram`, `/webhook/yookassa`. CORS разрешает `CORS_ORIGINS` (список через запятую), включая `https://web.telegram.org`. Rate limit: 120 запросов/мин на IP, для `/api/*`; webhook — без лимита.

**`start_param`:** при `POST /api/session` backend читает валидированный `start_param` из initData. Если он вида `join_<code>` и у пользователя нет пары, вызывает join RPC. Ошибки join не ломают вход: вернуть `notice` (например, «Приглашение уже использовано»). При успехе уведомить партнёра ботом. После создания/принятия/отвязки пары frontend обязан перезапросить `/api/session` (нужен новый Realtime JWT).

## 6. SQL (уже написан в `supabase/schema.sql`)

Backend вызывает только RPC (service role) и делает select/insert/update через service role. Имена и результаты:

- `app_create_pair(p_user_id bigint) -> jsonb { pair, created, partner: null }`
- `app_join_pair(p_user_id bigint, p_invite_code text) -> jsonb { pair, partner, joined }`; ошибки `PAIR_NOT_FOUND`, `PAIR_FULL`, `ALREADY_IN_PAIR`, `OWN_PAIR`
- `app_leave_pair(p_user_id bigint) -> jsonb { had_pair, pair_id, partner_id }`
- `app_set_display_name(p_user_id bigint, p_name text) -> jsonb user row`
- `app_set_relationship_start(p_user_id bigint, p_date date) -> jsonb pair row`
- `app_set_mood(p_user_id bigint, p_status text, p_text text) -> jsonb { user, should_notify }`
- `app_process_swipe(p_user_id bigint, p_category text, p_item_id text, p_item_title text, p_item_poster text, p_direction text) -> jsonb { swipe, match, is_match, new_match, usage, is_pro }`; ошибка `LIMIT_REACHED`
- `app_complete_match(p_user_id bigint, p_match_id uuid, p_completed boolean) -> jsonb match row`
- `app_create_reminder(p_user_id bigint, p_text text, p_remind_at timestamptz) -> jsonb { reminder, usage, is_pro }`; ошибка `LIMIT_REACHED`
- `app_claim_reminders(p_limit integer) -> setof reminders` (атомарно, `FOR UPDATE SKIP LOCKED`)
- `app_claim_reminder(p_reminder_id uuid) -> reminders | null`
- `app_mark_reminder_done(p_user_id bigint, p_reminder_id uuid) -> jsonb { reminder, sender_id, already_done }`
- `app_activate_trial(p_user_id bigint) -> jsonb { pair, already_active }`; ошибка `TRIAL_USED`
- `app_activate_paid_plan(p_pair_id uuid, p_plan text, p_provider text, p_provider_payment_id text, p_amount numeric, p_currency text, p_paid_by bigint, p_raw jsonb) -> jsonb { pair, payment, already_processed }`
- `app_expire_subscriptions() -> table(pair_id uuid, user1_id bigint, user2_id bigint, previous_plan text)`
- `app_moscow_today() -> date`

Таблицы: `users`, `pairs`, `daily_usage`, `swipes`, `matches`, `reminders`, `payments`. Строковые поля в БД snake_case. Backend маппит в camelCase.

Платёжные записи:
- Telegram Stars создают succeeded-запись внутри `app_activate_paid_plan` с `provider='telegram_stars'`, `provider_payment_id=telegram_payment_charge_id`.
- ЮKassa: backend сначала вставляет pending в `payments` (`provider='yookassa'`, `provider_payment_id=<yookassa id>`), затем после подтверждения вызывает RPC; RPC делает upsert и идемпотентен.

## 7. Backend — обязательное поведение

### 7.1 Сервис пользователей/пары
- `ensureUser(fromInitData)`: upsert по id. Не перезаписывать отредактированное `first_name` при каждом входе; обновлять `username`, `avatar_url`, `last_seen` нет (нет поля). Вставлять `first_name` из Telegram только при создании.
- `buildState(userId)`: всё для `AppState`. `partner` — второй участник пары. `pair.inviteLink = https://t.me/${BOT_USERNAME}?startapp=join_${inviteCode}`. `daysTogether`: разница дат (не меньше 0). `subscription`: эффективный план; если `subscription_expires_at <= now()`, считать `free`, `isPro=false`, но `trialUsed` сохранять. `limits`: для PRO limit=null, иначе 5/2/3; used из `daily_usage` за `app_moscow_today`.
- `mySwipes`: все item_id текущего пользователя по категориям (для фильтрации колоды).
- `matches` — последние 100 по created_at desc; `reminders` — последние 100 по created_at desc.

### 7.2 Свайпы
- Проверка лимита и создание мэтча — только через `app_process_swipe`, без гонок.
- После `new_match === true` уведомить **обоих** партнёров ботом: `🔥 У вас мэтч! Вы оба хотите: «<title>»`.
- При `LIMIT_REACHED` вернуть 409 с `details.category` и `details.limit`.
- Не позволять невалидные category/direction/itemId/title.

### 7.3 Настроение
- Вызвать RPC; если `should_notify`, отправить партнёру: `💭 <Имя> обновил(а) настроение: <emoji + label или кастомный текст>`. Антиспам реализован в SQL (15 мин).
- В приложении изменения приходят через Realtime без задержки.

### 7.4 Напоминания
- `app_create_reminder`; если `remindAt <= now()`, сразу `app_claim_reminder` и отправить ботом. Если отправка не удалась — вернуть `is_sent=false` (крон повторит).
- Крон каждую минуту: `app_claim_reminders(50)`, отправить каждому получателю сообщение с inline-кнопкой `✅ Выполнено`, callback_data `reminder_done:<uuid>`. При ошибке отправки: `update reminders set is_sent=false, sent_at=null, send_attempts=send_attempts+1, last_error=...` (не более 3 попыток; SQL уже фильтрует).
- Callback: принимает только получатель, помечает done, отвечает `answerCallbackQuery`, уведомляет отправителя `✅ <Имя> выполнил(а) твоё напоминание: "<text>"`.
- В приложении получатель тоже может отметить done.

### 7.5 Подписка и платежи
- Триал: `app_activate_trial`. Уведомить партнёра: `🎁 <Имя> активировал(а) PRO на 2 дня для вас двоих`.
- Stars:
  - `POST /api/subscription/stars-invoice`: создать payload с HMAC-подписью (секрет `PAYMENT_SIGNING_SECRET`), формат не длиннее 128 байт: `<pairId>.<m|y>.<userId>.<nonce>.<sig16>`.
  - `bot.api.raw.createInvoiceLink({ title, description, payload, currency: 'XTR', prices: [{ label, amount: STARS_* }] })`; `provider_token` не передавать.
  - `pre_checkout_query`: проверить payload, пару, план, currency XTR и total_amount === STARS_*; ответить true/false.
  - `message:successful_payment`: снова проверить payload и сумму, вызвать `app_activate_paid_plan` с charge id, уведомить обоих.
- ЮKassa:
  - `POST /api/subscription/yookassa`: REST `POST https://api.yookassa.ru/v3/payments` Basic Auth, `Idempotence-Key` UUID, amount RUB (`149.00`/`1299.00`), capture, redirect return_url, metadata `{ pair_id, user_id, plan }`. Вставить pending-платёж. Вернуть confirmation_url.
  - `POST /webhook/yookassa`: взять `object.id`, **обязательно** перепроверить платёж через `GET /v3/payments/{id}`, убедиться в status=succeeded, сверить metadata/сумму/валюту, идемпотентно активировать.
  - `POST /api/subscription/sync`: проверить pending-платежи пары через API (не более 3), активировать успешные, вернуть state + pending.
- `app_expire_subscriptions()` каждый час/тик: уведомить обоих `⏳ Ваш PRO-доступ завершился. Продлите подписку всего за 149 ₽/мес на двоих, чтобы свайпать без ограничений`.
- Цены и звёзды только из env. Не хардкодить в коде.

### 7.6 Бот
- `grammY`, webhook и polling режимы (`BOT_MODE=webhook|polling`). Webhook URL: `POST /webhook/telegram`, secret token header `X-Telegram-Bot-Api-Secret-Token` (`TELEGRAM_WEBHOOK_SECRET`), при старте `setWebhook`; в polling — `deleteWebhook` + `bot.start()`.
- `/start [join_CODE]`: ensure user; если payload join и пары нет — join RPC, уведомить партнёра, ответить. Если пары нет — welcome + кнопка `web_app` «Открыть пространство» на `MINI_APP_URL`; если пара есть — кнопка открыть. Ошибки join — понятные сообщения.
- `/help` — краткая справка.
- Глобальный `bot.catch` с логированием, без падения процесса.
- Уведомления не должны ломать основной запрос: ошибки Telegram API логировать.
- HTML parse mode, все пользовательские строки экранировать.
- При старте установить команды (`/start`, `/help`) и menu button (web_app). Не падать, если Telegram недоступен — логировать.
- Callback `reminder_done:<uuid>` обработать.
- `pre_checkout_query`, `message:successful_payment`.

### 7.7 Безопасность/инфраструктура
- Fastify: `trustProxy`, CORS, helmet, rate-limit, JSON body limit 64KB, graceful shutdown (SIGTERM/SIGINT).
- Валидация тел через Zod. Никаких секретов в ответах.
- `/api/cron/tick`: timing-safe сравнение `X-Cron-Secret` с `CRON_SECRET`; если не задан — 503.
- Планировщик: `setInterval` раз в минуту (напоминания + раз в час подписки) + ручной cron endpoint. Защита от наложения через boolean.
- Логи Pino с redaction секретов.
- `.env.example` со всеми переменными и комментариями. `README.md` пишет lead.

## 8. Frontend — обязательное поведение и дизайн

### 8.1 Инициализация
- В `index.html` до bundle: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.
- `main.tsx`: `WebApp.ready()`, `WebApp.expand()`, `setHeaderColor('secondary_bg_color')`, `setBackgroundColor('bg_color')`, подписка на `themeChanged`; CSS-переменные из `themeParams`:
  `--tg-bg`, `--tg-secondary-bg`, `--tg-text`, `--tg-hint`, `--tg-link`, `--tg-button`, `--tg-button-text`, `--tg-destructive`, `--tg-section-bg`, `--tg-header-bg`.
  Fallback-значения для светлой/тёмной темы. Класс `dark` + `data-theme`. Фон/текст через Tailwind `bg-tg-bg`, `text-tg-text` и т. п.
- Если `initData` пуст — экран «Откройте приложение через Telegram» (не белый экран).
- `@twa-dev/sdk`; тактильный отклик через обёртки: selection на переключениях, impact на свайпах/кнопках, notification success/warning/error на мэтче/ошибке/лимите.
- `viewportChanged`: обновлять CSS `--app-height`; использовать safe-area снизу. Не ломать прокрутку.

### 8.2 AppContext
- При старте `POST /api/session`; loading/error/retry; `state`, `session` (realtime/config), `refresh()` (GET state, без глобального лоадера), `refreshSession()` (POST session заново после pair change), `applyState`, `paywallReason/openPaywall/closePaywall`.
- Realtime hook: `createClient(url, anonKey, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }})`; `setAuth(token)`; channel `pair-sync` с `postgres_changes` для `users`, `pairs`, `matches`, `reminders`, `daily_usage`; debounce refresh 300–500 мс; reconnect встроен supabase. Статус connected показывать не обязательно.
- Fallback: polling `GET /api/state` каждые 30 секунд при visible, плюс `visibilitychange`/`focus`. Не показывать спиннер на фоновых обновлениях.
- После create/join/leave пары вызывать `refreshSession()`, чтобы получить новый Realtime token.
- Токен живёт 2 часа; при 401 показать экран «Переоткройте приложение» с кнопкой.

### 8.3 Экраны
**OnboardingPair**:
- Нет пары: заголовок «Пространство для двоих», объяснение, кнопка «Создать пространство». После создания — карточка приглашения: код, ссылка, кнопки «Отправить партнёру в Telegram» (`WebApp.openTelegramLink('https://t.me/share/url?url=...&text=...')`), «Скопировать ссылку» (clipboard + fallback), лоадер «Ждём партнёра…». Realtime/polling переключит на дашборд.
- Пара без партнёра — тот же waiting-экран.
- Не давать создать вторую пару.
- `Ошибки` показывать тостом/инлайном, кнопка повторить.
- Кнопка «Отвязаться» для отмены ожидания.

**HeaderPair** (sticky сверху):
- 2 аватара (fallback initials), имена, настроение каждого (emoji + короткий текст), «Вместе N дней» при дате, бейдж FREE/TRIAL/PRO.
- Тап по настроению партнёра — переход на вкладку «Настроение».
- Компактно, не выше ~150px; safe top.

**BottomNav**: 4 вкладки `Свайпы` 🎬, `Настроение` 💭, `Напоминания` 🔔, `Профиль` 👤; active pill; haptic; safe bottom; не перекрывать контент.

**SwipesTab**:
- Переключатель 🎬 Фильмы / 🍕 Еда; лимит-индикатор (`5 из 5`, для PRO «Безлимит PRO»).
- Загрузка `/api/content/...`, фильтрация уже свайпнутых (`state.mySwipes` + локальные). Стек до 3 карточек, Framer Motion drag по X, поворот, оверлеи «ХОЧУ»/«ПРОПУСК». Кнопки ❌ и ❤️. Кнопка «Наши мэтчи» с бейджем количества.
- Свайп: анимация, API, при 409 `LIMIT_REACHED` — вернуть карточку, открыть Paywall; при успехе обновить state; при `newMatch` — MatchModal. Не отправлять повторно, пока busy.
- Пустая колода — «Вы посмотрели всё» + «Обновить подборку»; если партнёра нет — подсказка.
- Подгрузка следующей порции при остатке < 4; обработка конца.
- Карточки: постер/фото, градиент, название, год/рейтинг/жанры или кухня/теги, описание. `onError` фото → стилизованный градиент с названием и emoji. Текст не обрезать критично; line-clamp.
- `MatchesSheet` — bottom sheet: вкладки фильмы/еда, постеры, дата, кнопка «Выполнено ✅» / «Вернуть», пустые состояния. Обновление через state.
- `MatchModal` — full-screen, анимация появления, постер, «ЭТО МЭТЧ! 🎉», имена, кнопка «Отправить в чат» (share URL) и «Продолжить». Haptic success.

**MoodTab**:
- 8 пресетов (ключи/эмодзи/подписи):
  `hugs 🥰 Хочу обнимашек`, `tired 🔋 На нуле, нужен отдых`, `snack 🍕 Хочу вкусняшку`, `playful 🔥 Игривое настроение`, `stressed 😤 Стресс / не трогать`, `chill 🎬 Хочу чиллить`, `adventure 🚀 Готов(а) к движу`, `miss 🥺 Скучаю`.
- Сетка 2 колонки, выбранный подсвечен. Тап — мгновенное сохранение (API).
- Поле кастомного статуса до 40 символов + счётчик + «Сохранить». Очистка.
- Карточка «Настроение партнёра» с временем обновления; если нет — приглашение.
- Ошибки — тост, состояние не терять.

**RemindersTab**:
- Пресеты: «Купи что-нибудь вкусное по дороге 🍫», «Напиши, как доберёшься ❤️», «Не забудь выпить воды / таблетки 💊», «Позвони мне, как освободишься 📞».
- Текст до 200 символов, счётчик. Выбор: «Сейчас», «Через 30 мин», «Через 1 час», «Выбрать время» (`datetime-local`, min now). Валидация.
- Лимит-индикатор; при 409 — Paywall.
- Список напоминаний (входящие/исходящие, статусы «Запланировано», «Отправлено», «Выполнено»), относительное время. Для входящих доступна кнопка «Выполнено ✅» (API).
- После создания — toast, обновление state; если отправлено сразу — отметить.

**ProfileTab**:
- Имя (до 40) + сохранить, дата начала отношений (date, не будущая) + сохранить, username Telegram, аватар.
- Карточка подписки: статус, дата окончания, дни остатка; FREE → «Открыть PRO» (paywall), TRIAL → «Оформить PRO»; кнопка «Проверить оплату» (`sync`).
- Приглашение: ссылка и копирование (если партнёр есть — для информации).
- «Отвязать пару» с модальным подтверждением (объяснить, что данные пары удалятся). После — onboarding.
- Ссылка на бота/поддержку.
- Все действия с лоадерами и ошибками.

**PaywallModal**:
- Причина (movie/food/reminder/upsell), закрытие.
- Если `trialUsed === false` и не PRO: акцентная кнопка «Попробовать PRO бесплатно 2 дня» → API, затем state/refresh, закрыть, toast. Мелким шрифтом «Без списания. Отмена в любой момент.». Ниже/рядом карточки тарифов.
- Если триал использован/закончился: 2 карточки: «Месяц PRO — 149 ₽/мес», «Год PRO — 1 299 ₽/год» с бейджем «Выгодно — 108 ₽/мес». Выбор.
- Преимущества ровно: «Безлимитные свайпы фильмов и еды каждый день», «Безлимит напоминаний партнёру», «Секретные подборки фильмов», «1 подписка сразу для двоих».
- Два способа оплаты: «Оплатить ⭐ Telegram Stars» и «Оплатить картой / СБП». Stars: API → `WebApp.openInvoice(link, cb)`; paid → `subscription/sync` + refresh + закрыть; cancelled/failed → toast. Карта: API → `WebApp.openLink(confirmationUrl)`, показать «Ожидаем оплату…», кнопка «Проверить оплату», поллинг `sync` каждые 5 с до 2 мин + на `visibilitychange`.
- Loading/disabled, ошибки, haptic.
- PRO: вместо paywall показывать «У вас активен PRO» (профиль).

### 8.4 Визуал
- Тёмная/светлая тема Telegram, контраст. Бренд: тёплый градиент rose → orange, но основные кнопки — Telegram button color.
- Скругления 20–28px, мягкие тени, `backdrop-blur` для header/nav, аккуратные отступы, mobile-first, max-width 520px по центру на десктопе.
- Анимации Framer Motion сдержанные; учитывать `prefers-reduced-motion`.
- Не использовать внешние шрифты; system-ui. Эмодзи как иконки, дополнительно простые inline SVG там, где уместно.
- Никаких горизонтальных скроллов и обрезанных кнопок на 320px. Тач-таргеты ≥44px.
- Все изображения с `loading="lazy"` (кроме верхней карточки), `onError` fallback.

## 9. Переменные окружения

См. `backend/.env.example` и `frontend/.env.example`. Backend валидирует env через Zod на старте и падает с понятным сообщением, если критичных переменных нет. Обязательные: `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `MINI_APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PAYMENT_SIGNING_SECRET`, `STARS_MONTHLY`, `STARS_YEARLY`, `PRICE_MONTHLY_RUB`, `PRICE_YEARLY_RUB`. Опциональные/зависящие от шлюза: `TMDB_API_KEY`, `TMDB_ACCESS_TOKEN`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `CRON_SECRET`, `BOT_MODE`, `TELEGRAM_WEBHOOK_SECRET`, `INIT_DATA_MAX_AGE_SECONDS`, `ENABLE_INTERNAL_CRON`, `LOG_LEVEL`.

## 10. Критерии приёмки

- `npm install` в корне, `npm run typecheck`, `npm run build` проходят без ошибок.
- Нет `TODO`, `FIXME`, `throw new Error('Not implemented')`, заглушек.
- Backend собирается в `backend/dist/server.js`; `npm start --workspace backend` запускает сервер (при валидном env).
- Frontend собирается в `frontend/dist`, корректно работает на 320px, темы переключаются.
- Все 4 вкладки и все модалки реализованы, все API-вызовы соответствуют контракту.
- SQL-функции вызываются ровно так, как описано.
- Код на русском UI и английском коде; комментарии только осмысленные, без «здесь остальной код».
