import { useMemo, useState } from 'react';
import type { ReminderInfo } from '@/types/api';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import {
  formatDateTime,
  formatRelative,
  fromDateTimeInputValue,
  reminderStatus,
  toDateTimeInputValue,
} from '@/lib/format';
import {
  hapticError,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { LimitMeter } from '@/components/LimitMeter';
import { Spinner } from '@/components/LoadingScreen';

const MAX_TEXT_LENGTH = 200;

type Timing = 'now' | '30' | '60' | 'custom';

const REMINDER_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: '🍫 Вкусное по дороге',
    text: 'Купи что-нибудь вкусное по дороге 🍫',
  },
  {
    label: '❤️ Напиши, как доберёшься',
    text: 'Напиши, как доберёшься ❤️',
  },
  {
    label: '💊 Выпить воды / таблетки',
    text: 'Не забудь выпить воды / таблетки 💊',
  },
  {
    label: '📞 Позвони, когда сможешь',
    text: 'Позвони мне, как освободишься 📞',
  },
];

const TIMING_OPTIONS: ReadonlyArray<{ key: Timing; label: string }> = [
  { key: 'now', label: 'Сейчас' },
  { key: '30', label: '+30 мин' },
  { key: '60', label: '+1 час' },
  { key: 'custom', label: 'Своё' },
];

const STATUS_STYLES: Record<
  ReturnType<typeof reminderStatus>['tone'],
  string
> = {
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  sent: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  pending: 'bg-amber-400/15 text-amber-700 dark:text-amber-200',
};

function ReminderCard({
  reminder,
  incoming,
  busy,
  onDone,
}: {
  reminder: ReminderInfo;
  incoming: boolean;
  busy: boolean;
  onDone: (reminder: ReminderInfo) => void;
}): JSX.Element {
  const status = reminderStatus(reminder);
  return (
    <div
      className={`rounded-2xl border p-3.5 ${
        incoming
          ? 'border-rose-300/20 bg-rose-500/[0.04]'
          : 'border-slate-300/15 bg-tg-secondary-bg/35'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5 text-tg-text">
          {reminder.text}
        </p>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <p className="text-[10px] leading-4 text-tg-hint">
          {formatRelative(reminder.remindAt)}
        </p>
        <span aria-hidden="true" className="text-[10px] text-tg-hint/60">
          ·
        </span>
        <p className="text-[10px] leading-4 text-tg-hint">
          {formatDateTime(reminder.remindAt)}
        </p>
        <span aria-hidden="true" className="text-[10px] text-tg-hint/60">
          ·
        </span>
        <p className="text-[10px] leading-4 text-tg-hint">
          {incoming ? 'от партнёра' : 'для партнёра'}
        </p>
      </div>

      {incoming && !reminder.isDone ? (
        <button
          type="button"
          onClick={() => onDone(reminder)}
          disabled={busy}
          className="mt-1.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          {busy ? <Spinner size={12} /> : <span aria-hidden="true">✅</span>}
          Выполнено
        </button>
      ) : null}
    </div>
  );
}

/** Вкладка напоминаний: конструктор, лимиты и история. */
export function RemindersTab(): JSX.Element {
  const { state, applyState, openPaywall, refresh } = useApp();
  const toast = useToast();

  const [text, setText] = useState('');
  const [timing, setTiming] = useState<Timing>('now');
  const [customDateTime, setCustomDateTime] = useState(() =>
    toDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneBusyId, setDoneBusyId] = useState<string | null>(null);

  const reminders = state?.reminders ?? [];
  const userId = state?.user.id ?? 0;

  const incoming = useMemo(
    () => reminders.filter((reminder) => reminder.receiverId === userId),
    [reminders, userId],
  );
  const outgoing = useMemo(
    () => reminders.filter((reminder) => reminder.senderId === userId),
    [reminders, userId],
  );

  const limits = state?.limits.reminders;
  const isUnlimited = state?.limits.isUnlimited ?? false;
  const limitReached =
    !isUnlimited &&
    limits !== undefined &&
    limits.limit !== null &&
    limits.used >= limits.limit;

  const minDateTime = toDateTimeInputValue(new Date());

  const resolveRemindAt = (): { value: string | null; error: string | null } => {
    if (timing === 'now') return { value: null, error: null };
    if (timing === '30') {
      return {
        value: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        error: null,
      };
    }
    if (timing === '60') {
      return {
        value: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        error: null,
      };
    }
    const date = fromDateTimeInputValue(customDateTime);
    if (!date) {
      return { value: null, error: 'Выберите дату и время напоминания' };
    }
    if (date.getTime() < Date.now() + 30_000) {
      return { value: null, error: 'Время уже прошло — выберите будущее' };
    }
    return { value: date.toISOString(), error: null };
  };

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError('Напишите, о чём напомнить партнёру');
      hapticWarning();
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError('Максимум 200 символов');
      return;
    }

    const resolved = resolveRemindAt();
    if (resolved.error) {
      setError(resolved.error);
      hapticWarning();
      return;
    }

    if (limitReached) {
      hapticWarning();
      openPaywall('reminder');
      toast.info('Дневной лимит напоминаний исчерпан');
      void refresh();
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const response = await api.createReminder(trimmed, resolved.value);
      applyState(response.state);
      hapticSuccess();
      setText('');
      setTiming('now');
      setCustomDateTime(
        toDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
      );
      toast.success(
        response.reminder.isSent
          ? 'Напоминание отправлено партнёру 💌'
          : 'Напоминание запланировано 💌',
      );
    } catch (caught) {
      hapticError();
      if (isApiError(caught) && caught.code === 'LIMIT_REACHED') {
        openPaywall('reminder');
        toast.error('Дневной лимит напоминаний исчерпан');
        void refresh();
      } else if (isApiError(caught) && caught.code === 'NO_PAIR') {
        toast.error('Пара больше не активна');
      } else {
        setError(getErrorMessage(caught));
        toast.error(getErrorMessage(caught));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDone = async (reminder: ReminderInfo): Promise<void> => {
    if (doneBusyId) return;
    setDoneBusyId(reminder.id);
    hapticSelection();
    try {
      const response = await api.markReminderDone(reminder.id);
      applyState(response.state);
      hapticSuccess();
      toast.success('Отметили как выполненное ✅');
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
    } finally {
      setDoneBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-3">
      <section className="surface-solid rounded-[24px] p-4">
        <h2 className="text-lg font-bold leading-6 text-tg-text">
          Напоминание партнёру
        </h2>
        <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
          Партнёр получит сообщение в Telegram с кнопкой «Выполнено»
        </p>

        {limits ? (
          <LimitMeter
            used={limits.used}
            limit={limits.limit}
            isUnlimited={isUnlimited}
            onUpgrade={() => openPaywall('reminder')}
            className="mt-3"
          />
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {REMINDER_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                hapticSelection();
                setText(preset.text);
                setError(null);
              }}
              className="flex min-h-[48px] items-center rounded-xl border border-slate-300/15 bg-tg-secondary-bg/40 px-2.5 py-2 text-left text-[10.5px] font-medium leading-4 text-tg-text/85"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="reminder-text"
              className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint"
            >
              Текст
            </label>
            <span
              className={`text-[11px] font-medium ${
                MAX_TEXT_LENGTH - text.length < 20
                  ? 'text-rose-500'
                  : 'text-tg-hint'
              }`}
            >
              {text.length}/{MAX_TEXT_LENGTH}
            </span>
          </div>
          <textarea
            id="reminder-text"
            value={text}
            onChange={(event) => {
              setText(event.target.value.slice(0, MAX_TEXT_LENGTH));
              setError(null);
            }}
            maxLength={MAX_TEXT_LENGTH}
            rows={3}
            placeholder="Например: не забудь взять зонт ☔"
            disabled={creating}
            className="field mt-1.5"
          />
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint">
            Когда
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {TIMING_OPTIONS.map((option) => {
              const isActive = option.key === timing;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    hapticSelection();
                    setTiming(option.key);
                    setError(null);
                  }}
                  aria-pressed={isActive}
                  className={`min-h-[44px] rounded-xl border px-1 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'border-tg-button bg-tg-button/10 text-tg-button'
                      : 'border-slate-300/20 bg-tg-secondary-bg/40 text-tg-hint'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {timing === 'custom' ? (
            <input
              type="datetime-local"
              value={customDateTime}
              min={minDateTime}
              onChange={(event) => {
                setCustomDateTime(event.target.value);
                setError(null);
              }}
              disabled={creating}
              aria-label="Точное время напоминания"
              className="field mt-2"
            />
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-2.5 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void handleCreate();
          }}
          disabled={creating}
          className="btn btn-primary mt-3 w-full"
        >
          {creating ? <Spinner size={18} /> : <span aria-hidden="true">🔔</span>}
          {timing === 'now' ? 'Отправить сейчас' : 'Запланировать'}
        </button>
        {limitReached ? (
          <p className="mt-1.5 text-center text-[10px] leading-4 text-tg-hint">
            Сегодня использованы все бесплатные напоминания. PRO — без лимита.
          </p>
        ) : null}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold leading-6 text-tg-text">
            Входящие
          </h2>
          <span className="text-[11px] text-tg-hint">{incoming.length}</span>
        </div>
        {incoming.length > 0 ? (
          <div className="mt-2 space-y-2">
            {incoming.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                incoming
                busy={doneBusyId === reminder.id}
                onDone={(item) => {
                  void handleDone(item);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-2xl border border-dashed border-slate-300/25 bg-tg-secondary-bg/25 px-4 py-4 text-center text-xs leading-5 text-tg-hint">
            Пока нет входящих напоминаний
          </p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold leading-6 text-tg-text">
            Исходящие
          </h2>
          <span className="text-[11px] text-tg-hint">{outgoing.length}</span>
        </div>
        {outgoing.length > 0 ? (
          <div className="mt-2 space-y-2">
            {outgoing.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                incoming={false}
                busy={false}
                onDone={() => undefined}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-2xl border border-dashed border-slate-300/25 bg-tg-secondary-bg/25 px-4 py-4 text-center text-xs leading-5 text-tg-hint">
            Вы ещё не отправляли напоминаний
          </p>
        )}
      </section>
    </div>
  );
}
