-- ============================================================================
--  «Пространство для двоих» — Supabase / PostgreSQL schema
--  Выполните этот файл один раз в Supabase SQL Editor.
--
--  ВАЖНО:
--   • Все записи в таблицы идут через backend с service_role.
--   • Клиент получает из backend подписанный Supabase JWT и использует его
--     только для Realtime. RLS ниже разрешает SELECT только своим данным пары.
--   • RPC-функции доступны только service_role.
--   • Дневные лимиты считаются по календарной дате Europe/Moscow (UTC+3).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Утилиты
-- ----------------------------------------------------------------------------
create or replace function public.app_moscow_today()
returns date
language sql
stable
as $$
  select (timezone('Europe/Moscow', now()))::date;
$$;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. users
--    pair_id FK добавляется после pairs: между таблицами циклическая связь.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id                bigint primary key,
  username          text,
  first_name        text not null,
  avatar_url        text,
  pair_id           uuid,
  mood_status       text not null default 'chill',
  mood_text         text,
  mood_updated_at   timestamptz not null default now(),
  mood_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint users_id_positive_check check (id > 0),
  constraint users_first_name_check check (char_length(btrim(first_name)) between 1 and 64),
  constraint users_mood_text_check check (mood_text is null or char_length(mood_text) <= 40),
  constraint users_mood_status_check check (
    mood_status in ('hugs', 'tired', 'snack', 'playful', 'stressed', 'chill', 'adventure', 'miss')
  )
);

-- ----------------------------------------------------------------------------
-- 2. pairs
-- ----------------------------------------------------------------------------
create table if not exists public.pairs (
  id                       uuid primary key default gen_random_uuid(),
  invite_code              text not null unique
                             default ('PAIR_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  user1_id                 bigint not null references public.users(id) on delete cascade,
  user2_id                 bigint references public.users(id) on delete set null,
  relationship_start_date  date,
  plan_type                text not null default 'free',
  trial_used               boolean not null default false,
  subscription_expires_at  timestamptz,
  paid_by_user_id          bigint references public.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pairs_plan_type_check check (plan_type in ('free', 'trial', 'pro_monthly', 'pro_yearly')),
  constraint pairs_distinct_users_check check (user2_id is null or user2_id <> user1_id),
  constraint pairs_invite_code_format_check check (invite_code ~ '^PAIR_[A-F0-9]{6}$'),
  constraint pairs_relationship_date_check check (
    relationship_start_date is null or relationship_start_date >= date '1950-01-01'
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_pair_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_pair_id_fkey
      foreign key (pair_id) references public.pairs(id) on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. daily_usage — лимиты на пару в сутки по МСК
-- ----------------------------------------------------------------------------
create table if not exists public.daily_usage (
  id                    uuid primary key default gen_random_uuid(),
  pair_id               uuid not null references public.pairs(id) on delete cascade,
  usage_date            date not null default public.app_moscow_today(),
  movie_swipes_count    integer not null default 0,
  food_swipes_count     integer not null default 0,
  reminders_sent_count  integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint daily_usage_counts_check check (
    movie_swipes_count >= 0 and food_swipes_count >= 0 and reminders_sent_count >= 0
  ),
  constraint daily_usage_pair_date_key unique (pair_id, usage_date)
);

-- ----------------------------------------------------------------------------
-- 4. swipes
-- ----------------------------------------------------------------------------
create table if not exists public.swipes (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.pairs(id) on delete cascade,
  user_id     bigint not null references public.users(id) on delete cascade,
  category    text not null,
  item_id     text not null,
  item_title  text not null,
  item_poster text not null default '',
  direction   text not null,
  created_at  timestamptz not null default now(),
  constraint swipes_category_check check (category in ('movie', 'food')),
  constraint swipes_direction_check check (direction in ('left', 'right')),
  constraint swipes_item_id_check check (char_length(item_id) between 1 and 128),
  constraint swipes_item_title_check check (char_length(btrim(item_title)) between 1 and 200),
  constraint swipes_pair_user_category_item_key unique (pair_id, user_id, category, item_id)
);

-- ----------------------------------------------------------------------------
-- 5. matches
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs(id) on delete cascade,
  category     text not null,
  item_id      text not null,
  item_title   text not null,
  item_poster  text not null default '',
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint matches_category_check check (category in ('movie', 'food')),
  constraint matches_item_id_check check (char_length(item_id) between 1 and 128),
  constraint matches_item_title_check check (char_length(btrim(item_title)) between 1 and 200),
  constraint matches_pair_category_item_key unique (pair_id, category, item_id)
);

-- ----------------------------------------------------------------------------
-- 6. reminders
-- ----------------------------------------------------------------------------
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  pair_id        uuid not null references public.pairs(id) on delete cascade,
  sender_id      bigint not null references public.users(id) on delete cascade,
  receiver_id    bigint not null references public.users(id) on delete cascade,
  text           text not null,
  remind_at      timestamptz not null default now(),
  is_sent        boolean not null default false,
  is_done        boolean not null default false,
  sent_at        timestamptz,
  done_at        timestamptz,
  send_attempts  integer not null default 0,
  last_error     text,
  created_at     timestamptz not null default now(),
  constraint reminders_text_check check (char_length(btrim(text)) between 1 and 200),
  constraint reminders_distinct_users_check check (sender_id <> receiver_id),
  constraint reminders_attempts_check check (send_attempts >= 0)
);

-- ----------------------------------------------------------------------------
-- 7. payments — идемпотентность и история платежей
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  pair_id              uuid not null references public.pairs(id) on delete cascade,
  user_id              bigint references public.users(id) on delete set null,
  provider             text not null,
  provider_payment_id  text not null,
  plan                 text not null,
  amount               numeric(12, 2) not null,
  currency             text not null,
  status               text not null default 'pending',
  raw                  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz,
  constraint payments_provider_check check (provider in ('telegram_stars', 'yookassa')),
  constraint payments_plan_check check (plan in ('monthly', 'yearly')),
  constraint payments_status_check check (status in ('pending', 'succeeded', 'canceled')),
  constraint payments_amount_check check (amount >= 0),
  constraint payments_provider_payment_key unique (provider, provider_payment_id)
);

-- ----------------------------------------------------------------------------
-- 8. Индексы
-- ----------------------------------------------------------------------------
create index if not exists users_pair_id_idx on public.users(pair_id);
create index if not exists pairs_user1_id_idx on public.pairs(user1_id);
create index if not exists pairs_user2_id_idx on public.pairs(user2_id);
create index if not exists pairs_expiry_idx
  on public.pairs(subscription_expires_at)
  where plan_type <> 'free';
create index if not exists swipes_pair_user_category_idx
  on public.swipes(pair_id, user_id, category);
create index if not exists swipes_pair_category_item_idx
  on public.swipes(pair_id, category, item_id);
create index if not exists matches_pair_created_idx
  on public.matches(pair_id, created_at desc);
create index if not exists reminders_due_idx
  on public.reminders(remind_at)
  where is_sent = false and is_done = false;
create index if not exists reminders_pair_created_idx
  on public.reminders(pair_id, created_at desc);
create index if not exists payments_pair_status_idx
  on public.payments(pair_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- 9. Триггеры updated_at
-- ----------------------------------------------------------------------------
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.app_set_updated_at();

drop trigger if exists pairs_set_updated_at on public.pairs;
create trigger pairs_set_updated_at
before update on public.pairs
for each row execute function public.app_set_updated_at();

drop trigger if exists daily_usage_set_updated_at on public.daily_usage;
create trigger daily_usage_set_updated_at
before update on public.daily_usage
for each row execute function public.app_set_updated_at();

-- ============================================================================
-- 10. RPC: пара
-- ============================================================================
create or replace function public.app_create_pair(p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    public.users%rowtype;
  v_pair    public.pairs%rowtype;
  v_code    text;
  v_attempt integer := 0;
begin
  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.pair_id is not null then
    select * into v_pair from public.pairs where id = v_user.pair_id;
    if found then
      return jsonb_build_object(
        'pair', to_jsonb(v_pair),
        'created', false,
        'partner', null
      );
    end if;
    update public.users set pair_id = null where id = p_user_id;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'PAIR_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    begin
      insert into public.pairs (invite_code, user1_id)
      values (v_code, p_user_id)
      returning * into v_pair;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'INVITE_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  update public.users
  set pair_id = v_pair.id, updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'pair', to_jsonb(v_pair),
    'created', true,
    'partner', null
  );
end;
$$;

create or replace function public.app_join_pair(p_user_id bigint, p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        public.users%rowtype;
  v_pair        public.pairs%rowtype;
  v_partner     jsonb;
  v_code        text;
begin
  v_code := upper(btrim(coalesce(p_invite_code, '')));

  if left(v_code, 5) = 'JOIN_' then
    v_code := substr(v_code, 6);
  end if;
  if left(v_code, 5) <> 'PAIR_' then
    v_code := 'PAIR_' || v_code;
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  select * into v_pair
  from public.pairs
  where invite_code = v_code
  for update;

  if not found then
    raise exception 'PAIR_NOT_FOUND';
  end if;

  if v_user.pair_id = v_pair.id then
    select to_jsonb(u) into v_partner
    from public.users u
    where u.id = case when v_pair.user1_id = p_user_id then v_pair.user2_id else v_pair.user1_id end;

    return jsonb_build_object(
      'pair', to_jsonb(v_pair),
      'partner', v_partner,
      'joined', false
    );
  end if;

  if v_user.pair_id is not null then
    raise exception 'ALREADY_IN_PAIR';
  end if;

  if v_pair.user1_id = p_user_id then
    raise exception 'OWN_PAIR';
  end if;

  if v_pair.user2_id is not null then
    raise exception 'PAIR_FULL';
  end if;

  update public.pairs
  set user2_id = p_user_id, updated_at = now()
  where id = v_pair.id
  returning * into v_pair;

  update public.users
  set pair_id = v_pair.id, updated_at = now()
  where id = p_user_id;

  select to_jsonb(u) into v_partner from public.users u where u.id = v_pair.user1_id;

  return jsonb_build_object(
    'pair', to_jsonb(v_pair),
    'partner', v_partner,
    'joined', true
  );
end;
$$;

create or replace function public.app_leave_pair(p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       public.users%rowtype;
  v_pair       public.pairs%rowtype;
  v_partner_id bigint;
begin
  select * into v_user from public.users where id = p_user_id for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.pair_id is null then
    return jsonb_build_object('had_pair', false, 'pair_id', null, 'partner_id', null);
  end if;

  select * into v_pair from public.pairs where id = v_user.pair_id for update;

  if not found then
    update public.users set pair_id = null where id = p_user_id;
    return jsonb_build_object('had_pair', false, 'pair_id', null, 'partner_id', null);
  end if;

  if v_pair.user1_id = p_user_id then
    v_partner_id := v_pair.user2_id;
  else
    v_partner_id := v_pair.user1_id;
  end if;

  update public.users
  set pair_id = null, updated_at = now()
  where pair_id = v_pair.id;

  delete from public.pairs where id = v_pair.id;

  return jsonb_build_object(
    'had_pair', true,
    'pair_id', v_pair.id,
    'partner_id', v_partner_id
  );
end;
$$;

-- ============================================================================
-- 11. RPC: профиль и настроение
-- ============================================================================
create or replace function public.app_set_display_name(p_user_id bigint, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_user public.users%rowtype;
begin
  v_name := btrim(coalesce(p_name, ''));

  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'INVALID_NAME';
  end if;

  update public.users
  set first_name = v_name, updated_at = now()
  where id = p_user_id
  returning * into v_user;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  return to_jsonb(v_user);
end;
$$;

create or replace function public.app_set_relationship_start(p_user_id bigint, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id uuid;
  v_pair    public.pairs%rowtype;
begin
  select pair_id into v_pair_id from public.users where id = p_user_id;

  if v_pair_id is null then
    raise exception 'NO_PAIR';
  end if;

  if p_date is not null and p_date > public.app_moscow_today() then
    raise exception 'INVALID_DATE';
  end if;

  if p_date is not null and p_date < date '1950-01-01' then
    raise exception 'INVALID_DATE';
  end if;

  update public.pairs
  set relationship_start_date = p_date, updated_at = now()
  where id = v_pair_id
  returning * into v_pair;

  return to_jsonb(v_pair);
end;
$$;

create or replace function public.app_set_mood(p_user_id bigint, p_status text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user           public.users%rowtype;
  v_text           text;
  v_changed        boolean;
  v_should_notify  boolean := false;
begin
  if p_status not in ('hugs', 'tired', 'snack', 'playful', 'stressed', 'chill', 'adventure', 'miss') then
    raise exception 'INVALID_MOOD';
  end if;

  v_text := nullif(btrim(coalesce(p_text, '')), '');

  if v_text is not null and char_length(v_text) > 40 then
    raise exception 'INVALID_MOOD';
  end if;

  select * into v_user from public.users where id = p_user_id for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_changed := v_user.mood_status is distinct from p_status
               or v_user.mood_text is distinct from v_text;

  if v_changed then
    v_should_notify := v_user.mood_notified_at is null
                       or v_user.mood_notified_at < now() - interval '15 minutes';

    update public.users
    set mood_status = p_status,
        mood_text = v_text,
        mood_updated_at = now(),
        mood_notified_at = case when v_should_notify then now() else mood_notified_at end,
        updated_at = now()
    where id = p_user_id
    returning * into v_user;
  end if;

  return jsonb_build_object(
    'user', to_jsonb(v_user),
    'should_notify', v_should_notify
  );
end;
$$;

-- ============================================================================
-- 12. RPC: свайпы и мэтчи
-- ============================================================================
create or replace function public.app_process_swipe(
  p_user_id bigint,
  p_category text,
  p_item_id text,
  p_item_title text,
  p_item_poster text,
  p_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id     uuid;
  v_pair        public.pairs%rowtype;
  v_usage       public.daily_usage%rowtype;
  v_existing    public.swipes%rowtype;
  v_swipe       public.swipes%rowtype;
  v_match       public.matches%rowtype;
  v_partner_id  bigint;
  v_is_pro      boolean := false;
  v_limit       integer;
  v_used        integer;
  v_has_match   boolean := false;
  v_new_match   boolean := false;
begin
  if p_category not in ('movie', 'food') then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_direction not in ('left', 'right') then
    raise exception 'INVALID_DIRECTION';
  end if;

  if p_item_id is null or char_length(btrim(p_item_id)) < 1 or char_length(p_item_id) > 128 then
    raise exception 'INVALID_ITEM';
  end if;

  if p_item_title is null or char_length(btrim(p_item_title)) < 1 or char_length(p_item_title) > 200 then
    raise exception 'INVALID_ITEM';
  end if;

  select pair_id into v_pair_id from public.users where id = p_user_id;

  if v_pair_id is null then
    raise exception 'NO_PAIR';
  end if;

  select * into v_pair from public.pairs where id = v_pair_id for update;

  if not found then
    raise exception 'NO_PAIR';
  end if;

  v_is_pro := v_pair.plan_type <> 'free'
              and v_pair.subscription_expires_at is not null
              and v_pair.subscription_expires_at > now();

  insert into public.daily_usage (pair_id, usage_date)
  values (v_pair.id, public.app_moscow_today())
  on conflict (pair_id, usage_date) do nothing;

  select * into v_usage
  from public.daily_usage
  where pair_id = v_pair.id and usage_date = public.app_moscow_today()
  for update;

  select * into v_existing
  from public.swipes
  where pair_id = v_pair.id
    and user_id = p_user_id
    and category = p_category
    and item_id = p_item_id;

  if found then
    select * into v_match
    from public.matches
    where pair_id = v_pair.id and category = p_category and item_id = p_item_id;

    if found then
      v_has_match := true;
    end if;

    return jsonb_build_object(
      'swipe', to_jsonb(v_existing),
      'match', case when v_has_match then to_jsonb(v_match) else null end,
      'is_match', v_has_match,
      'new_match', false,
      'usage', to_jsonb(v_usage),
      'is_pro', v_is_pro
    );
  end if;

  if not v_is_pro then
    if p_category = 'movie' then
      v_used := v_usage.movie_swipes_count;
      v_limit := 5;
    else
      v_used := v_usage.food_swipes_count;
      v_limit := 2;
    end if;

    if v_used >= v_limit then
      raise exception 'LIMIT_REACHED' using hint = v_limit::text;
    end if;
  end if;

  insert into public.swipes (
    pair_id, user_id, category, item_id, item_title, item_poster, direction
  )
  values (
    v_pair.id, p_user_id, p_category, btrim(p_item_id), btrim(p_item_title), coalesce(p_item_poster, ''), p_direction
  )
  returning * into v_swipe;

  if p_category = 'movie' then
    update public.daily_usage
    set movie_swipes_count = movie_swipes_count + 1
    where id = v_usage.id
    returning * into v_usage;
  else
    update public.daily_usage
    set food_swipes_count = food_swipes_count + 1
    where id = v_usage.id
    returning * into v_usage;
  end if;

  if p_direction = 'right' then
    select u.id into v_partner_id
    from public.users u
    where u.pair_id = v_pair.id and u.id <> p_user_id
    limit 1;

    if v_partner_id is not null and exists (
      select 1
      from public.swipes s
      where s.pair_id = v_pair.id
        and s.user_id = v_partner_id
        and s.category = p_category
        and s.item_id = p_item_id
        and s.direction = 'right'
    ) then
      v_has_match := true;

      insert into public.matches (pair_id, category, item_id, item_title, item_poster)
      values (v_pair.id, p_category, btrim(p_item_id), btrim(p_item_title), coalesce(p_item_poster, ''))
      on conflict (pair_id, category, item_id) do nothing
      returning * into v_match;

      if found then
        v_new_match := true;
      else
        select * into v_match
        from public.matches
        where pair_id = v_pair.id and category = p_category and item_id = p_item_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'swipe', to_jsonb(v_swipe),
    'match', case when v_has_match then to_jsonb(v_match) else null end,
    'is_match', v_has_match,
    'new_match', v_new_match,
    'usage', to_jsonb(v_usage),
    'is_pro', v_is_pro
  );
end;
$$;

create or replace function public.app_complete_match(p_user_id bigint, p_match_id uuid, p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id uuid;
  v_match   public.matches%rowtype;
begin
  select pair_id into v_pair_id from public.users where id = p_user_id;

  if v_pair_id is null then
    raise exception 'NO_PAIR';
  end if;

  update public.matches
  set is_completed = p_completed,
      completed_at = case when p_completed then now() else null end
  where id = p_match_id and pair_id = v_pair_id
  returning * into v_match;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  return to_jsonb(v_match);
end;
$$;

-- ============================================================================
-- 13. RPC: напоминания
-- ============================================================================
create or replace function public.app_create_reminder(
  p_user_id bigint,
  p_text text,
  p_remind_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id     uuid;
  v_pair        public.pairs%rowtype;
  v_usage       public.daily_usage%rowtype;
  v_reminder    public.reminders%rowtype;
  v_receiver_id bigint;
  v_text        text;
  v_remind_at   timestamptz;
  v_is_pro      boolean := false;
begin
  v_text := btrim(coalesce(p_text, ''));

  if char_length(v_text) < 1 or char_length(v_text) > 200 then
    raise exception 'INVALID_REMINDER_TEXT';
  end if;

  select pair_id into v_pair_id from public.users where id = p_user_id;

  if v_pair_id is null then
    raise exception 'NO_PAIR';
  end if;

  select * into v_pair from public.pairs where id = v_pair_id for update;

  if not found then
    raise exception 'NO_PAIR';
  end if;

  select u.id into v_receiver_id
  from public.users u
  where u.pair_id = v_pair.id and u.id <> p_user_id
  limit 1;

  if v_receiver_id is null then
    raise exception 'NO_PARTNER';
  end if;

  v_remind_at := greatest(coalesce(p_remind_at, now()), now());

  v_is_pro := v_pair.plan_type <> 'free'
              and v_pair.subscription_expires_at is not null
              and v_pair.subscription_expires_at > now();

  insert into public.daily_usage (pair_id, usage_date)
  values (v_pair.id, public.app_moscow_today())
  on conflict (pair_id, usage_date) do nothing;

  select * into v_usage
  from public.daily_usage
  where pair_id = v_pair.id and usage_date = public.app_moscow_today()
  for update;

  if not v_is_pro and v_usage.reminders_sent_count >= 3 then
    raise exception 'LIMIT_REACHED' using hint = '3';
  end if;

  update public.daily_usage
  set reminders_sent_count = reminders_sent_count + 1
  where id = v_usage.id
  returning * into v_usage;

  insert into public.reminders (pair_id, sender_id, receiver_id, text, remind_at)
  values (v_pair.id, p_user_id, v_receiver_id, v_text, v_remind_at)
  returning * into v_reminder;

  return jsonb_build_object(
    'reminder', to_jsonb(v_reminder),
    'usage', to_jsonb(v_usage),
    'is_pro', v_is_pro
  );
end;
$$;

create or replace function public.app_claim_reminders(p_limit integer default 50)
returns setof public.reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select r.id
    from public.reminders r
    where r.is_sent = false
      and r.is_done = false
      and r.send_attempts < 3
      and r.remind_at <= now()
    order by r.remind_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  ),
  updated as (
    update public.reminders r
    set is_sent = true, sent_at = now()
    from due
    where r.id = due.id
    returning r.*
  )
  select * from updated;
end;
$$;

create or replace function public.app_claim_reminder(p_reminder_id uuid)
returns public.reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reminder public.reminders%rowtype;
begin
  update public.reminders
  set is_sent = true, sent_at = now()
  where id = p_reminder_id
    and is_sent = false
    and is_done = false
    and send_attempts < 3
    and remind_at <= now() + interval '5 seconds'
  returning * into v_reminder;

  if not found then
    return null;
  end if;

  return v_reminder;
end;
$$;

create or replace function public.app_mark_reminder_done(p_user_id bigint, p_reminder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reminder public.reminders%rowtype;
  v_already  boolean := false;
begin
  select * into v_reminder
  from public.reminders
  where id = p_reminder_id
  for update;

  if not found then
    raise exception 'REMINDER_NOT_FOUND';
  end if;

  if v_reminder.receiver_id <> p_user_id then
    raise exception 'NOT_REMINDER_RECEIVER';
  end if;

  if v_reminder.is_done then
    v_already := true;
  else
    update public.reminders
    set is_done = true,
        done_at = now(),
        is_sent = true,
        sent_at = coalesce(sent_at, now())
    where id = p_reminder_id
    returning * into v_reminder;
  end if;

  return jsonb_build_object(
    'reminder', to_jsonb(v_reminder),
    'sender_id', v_reminder.sender_id,
    'already_done', v_already
  );
end;
$$;

-- ============================================================================
-- 14. RPC: подписка и платежи
-- ============================================================================
create or replace function public.app_activate_trial(p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id uuid;
  v_pair    public.pairs%rowtype;
begin
  select pair_id into v_pair_id from public.users where id = p_user_id;

  if v_pair_id is null then
    raise exception 'NO_PAIR';
  end if;

  select * into v_pair from public.pairs where id = v_pair_id for update;

  if not found then
    raise exception 'NO_PAIR';
  end if;

  if v_pair.plan_type <> 'free'
     and v_pair.subscription_expires_at is not null
     and v_pair.subscription_expires_at > now() then
    return jsonb_build_object('pair', to_jsonb(v_pair), 'already_active', true);
  end if;

  if v_pair.trial_used then
    raise exception 'TRIAL_USED';
  end if;

  update public.pairs
  set plan_type = 'trial',
      trial_used = true,
      subscription_expires_at = now() + interval '48 hours',
      paid_by_user_id = p_user_id,
      updated_at = now()
  where id = v_pair.id
  returning * into v_pair;

  return jsonb_build_object('pair', to_jsonb(v_pair), 'already_active', false);
end;
$$;

create or replace function public.app_activate_paid_plan(
  p_pair_id uuid,
  p_plan text,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_currency text,
  p_paid_by bigint,
  p_raw jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair     public.pairs%rowtype;
  v_payment  public.payments%rowtype;
  v_base     timestamptz;
  v_expires  timestamptz;
  v_plan_type text;
begin
  if p_plan not in ('monthly', 'yearly') then
    raise exception 'INVALID_PAYMENT_PLAN';
  end if;

  if p_provider not in ('telegram_stars', 'yookassa') then
    raise exception 'INVALID_PAYMENT_PROVIDER';
  end if;

  if p_provider_payment_id is null or char_length(p_provider_payment_id) < 1 then
    raise exception 'INVALID_PAYMENT_ID';
  end if;

  select * into v_pair from public.pairs where id = p_pair_id for update;

  if not found then
    raise exception 'PAIR_NOT_FOUND';
  end if;

  select * into v_payment
  from public.payments
  where provider = p_provider and provider_payment_id = p_provider_payment_id;

  if found then
    if v_payment.pair_id <> p_pair_id then
      raise exception 'PAYMENT_CONFLICT';
    end if;

    if v_payment.status = 'succeeded' then
      return jsonb_build_object(
        'pair', to_jsonb(v_pair),
        'payment', to_jsonb(v_payment),
        'already_processed', true
      );
    end if;
  end if;

  v_base := greatest(now(), coalesce(v_pair.subscription_expires_at, now()));

  if p_plan = 'monthly' then
    v_expires := v_base + interval '30 days';
    v_plan_type := 'pro_monthly';
  else
    v_expires := v_base + interval '365 days';
    v_plan_type := 'pro_yearly';
  end if;

  update public.pairs
  set plan_type = v_plan_type,
      subscription_expires_at = v_expires,
      paid_by_user_id = p_paid_by,
      updated_at = now()
  where id = p_pair_id
  returning * into v_pair;

  insert into public.payments (
    pair_id, user_id, provider, provider_payment_id, plan, amount, currency, status, raw, paid_at
  )
  values (
    p_pair_id, p_paid_by, p_provider, p_provider_payment_id, p_plan,
    coalesce(p_amount, 0), coalesce(p_currency, ''), 'succeeded',
    coalesce(p_raw, '{}'::jsonb), now()
  )
  on conflict (provider, provider_payment_id) do update
  set pair_id = excluded.pair_id,
      user_id = excluded.user_id,
      plan = excluded.plan,
      amount = excluded.amount,
      currency = excluded.currency,
      status = 'succeeded',
      raw = excluded.raw,
      paid_at = now()
  returning * into v_payment;

  return jsonb_build_object(
    'pair', to_jsonb(v_pair),
    'payment', to_jsonb(v_payment),
    'already_processed', false
  );
end;
$$;

create or replace function public.app_expire_subscriptions()
returns table (
  pair_id uuid,
  user1_id bigint,
  user2_id bigint,
  previous_plan text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with targets as (
    select p.id, p.user1_id, p.user2_id, p.plan_type
    from public.pairs p
    where p.plan_type <> 'free'
      and p.subscription_expires_at is not null
      and p.subscription_expires_at <= now()
    for update skip locked
  ),
  updated as (
    update public.pairs p
    set plan_type = 'free',
        subscription_expires_at = null,
        updated_at = now()
    from targets t
    where p.id = t.id
    returning p.id
  )
  select t.id, t.user1_id, t.user2_id, t.plan_type
  from targets t
  join updated u on u.id = t.id;
end;
$$;

-- ============================================================================
-- 15. RLS
--    Чтение разрешено только участникам пары (для Realtime).
--    Запись — только backend через service_role.
-- ============================================================================
alter table public.users enable row level security;
alter table public.pairs enable row level security;
alter table public.daily_usage enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.reminders enable row level security;
alter table public.payments enable row level security;

drop policy if exists users_select_own_pair on public.users;
create policy users_select_own_pair
on public.users
for select
to authenticated
using (
  id = nullif(auth.jwt() ->> 'telegram_id', '')::bigint
  or pair_id = nullif(auth.jwt() ->> 'pair_id', '')::uuid
);

drop policy if exists pairs_select_own on public.pairs;
create policy pairs_select_own
on public.pairs
for select
to authenticated
using (id = nullif(auth.jwt() ->> 'pair_id', '')::uuid);

drop policy if exists daily_usage_select_own on public.daily_usage;
create policy daily_usage_select_own
on public.daily_usage
for select
to authenticated
using (pair_id = nullif(auth.jwt() ->> 'pair_id', '')::uuid);

drop policy if exists swipes_select_own on public.swipes;
create policy swipes_select_own
on public.swipes
for select
to authenticated
using (pair_id = nullif(auth.jwt() ->> 'pair_id', '')::uuid);

drop policy if exists matches_select_own on public.matches;
create policy matches_select_own
on public.matches
for select
to authenticated
using (pair_id = nullif(auth.jwt() ->> 'pair_id', '')::uuid);

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own
on public.reminders
for select
to authenticated
using (pair_id = nullif(auth.jwt() ->> 'pair_id', '')::uuid);

-- payments клиенту не отдаём вообще (нет policy)

-- Отзываем права на запись и прямой доступ anon.
revoke all on table public.users from anon, authenticated;
revoke all on table public.pairs from anon, authenticated;
revoke all on table public.daily_usage from anon, authenticated;
revoke all on table public.swipes from anon, authenticated;
revoke all on table public.matches from anon, authenticated;
revoke all on table public.reminders from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

grant select on table public.users to authenticated;
grant select on table public.pairs to authenticated;
grant select on table public.daily_usage to authenticated;
grant select on table public.swipes to authenticated;
grant select on table public.matches to authenticated;
grant select on table public.reminders to authenticated;

-- Backend использует service_role (service key / service_role JWT).
-- BYPASSRLS не даёт SQL-привилегий автоматически, поэтому выдаём их явно.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ----------------------------------------------------------------------------
-- 16. Права на RPC: только service_role
-- ----------------------------------------------------------------------------
revoke all on function public.app_moscow_today() from public, anon, authenticated;
revoke all on function public.app_create_pair(bigint) from public, anon, authenticated;
revoke all on function public.app_join_pair(bigint, text) from public, anon, authenticated;
revoke all on function public.app_leave_pair(bigint) from public, anon, authenticated;
revoke all on function public.app_set_display_name(bigint, text) from public, anon, authenticated;
revoke all on function public.app_set_relationship_start(bigint, date) from public, anon, authenticated;
revoke all on function public.app_set_mood(bigint, text, text) from public, anon, authenticated;
revoke all on function public.app_process_swipe(bigint, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_complete_match(bigint, uuid, boolean) from public, anon, authenticated;
revoke all on function public.app_create_reminder(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.app_claim_reminders(integer) from public, anon, authenticated;
revoke all on function public.app_claim_reminder(uuid) from public, anon, authenticated;
revoke all on function public.app_mark_reminder_done(bigint, uuid) from public, anon, authenticated;
revoke all on function public.app_activate_trial(bigint) from public, anon, authenticated;
revoke all on function public.app_activate_paid_plan(uuid, text, text, text, numeric, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.app_expire_subscriptions() from public, anon, authenticated;

grant execute on function public.app_moscow_today() to service_role;
grant execute on function public.app_create_pair(bigint) to service_role;
grant execute on function public.app_join_pair(bigint, text) to service_role;
grant execute on function public.app_leave_pair(bigint) to service_role;
grant execute on function public.app_set_display_name(bigint, text) to service_role;
grant execute on function public.app_set_relationship_start(bigint, date) to service_role;
grant execute on function public.app_set_mood(bigint, text, text) to service_role;
grant execute on function public.app_process_swipe(bigint, text, text, text, text, text) to service_role;
grant execute on function public.app_complete_match(bigint, uuid, boolean) to service_role;
grant execute on function public.app_create_reminder(bigint, text, timestamptz) to service_role;
grant execute on function public.app_claim_reminders(integer) to service_role;
grant execute on function public.app_claim_reminder(uuid) to service_role;
grant execute on function public.app_mark_reminder_done(bigint, uuid) to service_role;
grant execute on function public.app_activate_trial(bigint) to service_role;
grant execute on function public.app_activate_paid_plan(uuid, text, text, text, numeric, text, bigint, jsonb) to service_role;
grant execute on function public.app_expire_subscriptions() to service_role;

-- ============================================================================
-- 17. Supabase Realtime
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['users', 'pairs', 'matches', 'reminders', 'daily_usage']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.users replica identity full;
alter table public.pairs replica identity full;
alter table public.matches replica identity full;
alter table public.reminders replica identity full;
alter table public.daily_usage replica identity full;

-- ============================================================================
-- 18. Комментарии к таблицам
-- ============================================================================
comment on table public.users is 'Пользователи Telegram Mini App; id = Telegram user_id';
comment on table public.pairs is 'Пара; одна подписка и лимиты на двоих';
comment on table public.daily_usage is 'Дневные лимиты пары по Europe/Moscow';
comment on table public.swipes is 'Свайпы пользователей по фильмам и еде';
comment on table public.matches is 'Взаимные лайки пары';
comment on table public.reminders is 'Напоминания партнёру с отложенной отправкой';
comment on table public.payments is 'Идемпотентные платежи Telegram Stars и ЮKassa';

notify pgrst, 'reload schema';

commit;
