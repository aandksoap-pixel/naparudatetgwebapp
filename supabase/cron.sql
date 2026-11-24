-- ============================================================================
--  Автоматическое поддержание Render backend + cron напоминаний
--  Выполните в Supabase SQL Editor с реальным CRON_SECRET из backend/.env.
--  Требуются расширения pg_cron и pg_net (Supabase Free поддерживает).
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Пинг health каждые 5 минут: Render Free не засыпает, Supabase не паузится.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'render-keepalive') then
    perform cron.unschedule('render-keepalive');
  end if;
end $$;

select cron.schedule(
  'render-keepalive',
  '*/5 * * * *',
  $job$select net.http_get(
    'https://naparu-backend.onrender.com/api/health',
    '{}'::jsonb,
    '{}'::jsonb,
    30000
  )$job$
);

-- Каждую минуту дёргаем cron backend: напоминания и истечение подписок.
-- Замените CRON_SECRET на значение из backend/.env.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'backend-cron-tick') then
    perform cron.unschedule('backend-cron-tick');
  end if;
end $$;

select cron.schedule(
  'backend-cron-tick',
  '* * * * *',
  $job$select net.http_post(
    'https://naparu-backend.onrender.com/api/cron/tick',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"X-Cron-Secret":"CRON_SECRET"}'::jsonb,
    30000
  )$job$
);

-- Проверка последних запусков:
-- select jobid, jobname, schedule, active from cron.job;
-- select jobid, status, return_message, start_time from cron.job_run_details
--   order by start_time desc limit 10;
