import { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '@/lib/api';
import {
  formatDate,
  formatDays,
  parseDateOnly,
  planTitle,
  todayDateInput,
} from '@/lib/format';
import {
  hapticError,
  hapticSelection,
  hapticSuccess,
} from '@/lib/haptics';
import { copyText, openTelegramLink } from '@/lib/telegram';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/Avatar';
import { Modal } from '@/components/Modal';
import { PlanBadge } from '@/components/PlanBadge';
import { Spinner } from '@/components/LoadingScreen';

/** Профиль пары, подписка, приглашение и отвязка. */
export function ProfileTab(): JSX.Element {
  const {
    state,
    config,
    applyState,
    refreshSession,
    openPaywall,
  } = useApp();
  const toast = useToast();

  const [name, setName] = useState(state?.user.firstName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [date, setDate] = useState(state?.pair?.relationshipStartDate ?? '');
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [dateTouched, setDateTouched] = useState(false);

  const savedNameRef = useRef(state?.user.firstName ?? '');

  /* Синхронизируем черновики, если данные пришли извне (партнёр/другое устройство). */
  useEffect(() => {
    const nextSaved = state?.user.firstName ?? '';
    setName((current) =>
      current.trim() === savedNameRef.current.trim() ? nextSaved : current,
    );
    savedNameRef.current = nextSaved;
  }, [state?.user.firstName]);

  useEffect(() => {
    if (!dateTouched) {
      setDate(state?.pair?.relationshipStartDate ?? '');
    }
  }, [dateTouched, state?.pair?.relationshipStartDate]);

  const [syncing, setSyncing] = useState(false);
  const [copying, setCopying] = useState(false);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  if (!state) return <div />;

  const { user, pair, partner, subscription } = state;
  const savedName = user.firstName;
  const savedDate = pair?.relationshipStartDate ?? '';
  const maxDate = todayDateInput();
  const nameChanged = name.trim() !== savedName.trim();
  const dateChanged = date !== savedDate;

  const handleSaveName = async (): Promise<void> => {
    if (nameSaving) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError('Имя не может быть пустым');
      return;
    }
    if (trimmed.length > 40) {
      setNameError('Максимум 40 символов');
      return;
    }
    setNameSaving(true);
    setNameError(null);
    hapticSelection();
    try {
      const response = await api.updateProfile(trimmed);
      applyState(response.state);
      setName(trimmed);
      hapticSuccess();
      toast.success('Имя сохранено');
    } catch (caught) {
      hapticError();
      setNameError(getErrorMessage(caught));
    } finally {
      setNameSaving(false);
    }
  };

  const handleSaveDate = async (): Promise<void> => {
    if (dateSaving) return;
    setDateSaving(true);
    setDateError(null);
    hapticSelection();
    try {
      let payload: string | null = null;
      if (date.trim().length > 0) {
        const parsed = parseDateOnly(date);
        if (!parsed) {
          setDateError('Укажите корректную дату');
          return;
        }
        const today = parseDateOnly(maxDate);
        if (today && parsed.getTime() > today.getTime()) {
          setDateError('Дата не может быть в будущем');
          return;
        }
        payload = date;
      }
      const response = await api.setRelationshipDate(payload);
      applyState(response.state);
      setDate(payload ?? '');
      setDateTouched(false);
      hapticSuccess();
      toast.success(
        payload ? 'Дата начала отношений сохранена' : 'Дата удалена',
      );
    } catch (caught) {
      hapticError();
      setDateError(getErrorMessage(caught));
    } finally {
      setDateSaving(false);
    }
  };

  const handleSync = async (): Promise<void> => {
    if (syncing) return;
    setSyncing(true);
    hapticSelection();
    try {
      const response = await api.syncSubscription();
      applyState(response.state);
      if (response.state.subscription.isPro) {
        hapticSuccess();
        toast.success('Оплата подтверждена — PRO активирован ✨');
      } else if (response.pending) {
        toast.info('Оплата ещё обрабатывается. Загляните чуть позже.');
      } else {
        toast.info('Активных платежей не найдено');
      }
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyInvite = async (): Promise<void> => {
    if (!pair) return;
    setCopying(true);
    const copied = await copyText(pair.inviteLink);
    setCopying(false);
    if (copied) {
      hapticSelection();
      toast.success('Ссылка скопирована');
    } else {
      hapticError();
      toast.error('Не удалось скопировать ссылку');
    }
  };

  const handleLeave = async (): Promise<void> => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      const response = await api.leavePair();
      applyState(response.state);
      setLeaveOpen(false);
      hapticSuccess();
      toast.success('Пара отвязана');
      await refreshSession();
    } catch (caught) {
      hapticError();
      setLeaveError(getErrorMessage(caught));
    } finally {
      setLeaving(false);
    }
  };

  const handleOpenBot = (): void => {
    if (!config?.botUsername) return;
    hapticSelection();
    openTelegramLink(`https://t.me/${config.botUsername}`);
  };

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-3">
      {/* Профиль */}
      <section className="surface-solid rounded-[24px] p-4">
        <div className="flex items-center gap-3.5">
          <Avatar
            name={user.firstName}
            src={user.avatarUrl}
            size={64}
            ring
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-6 text-tg-text">
              {user.firstName}
            </p>
            <p className="mt-0.5 truncate text-xs text-tg-hint">
              {user.username ? `@${user.username}` : 'Telegram-аккаунт'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <PlanBadge plan={subscription.plan} size="sm" />
              {pair?.daysTogether !== null &&
              pair?.daysTogether !== undefined ? (
                <span className="rounded-full bg-tg-secondary-bg/70 px-2 py-0.5 text-[10px] font-medium text-tg-hint">
                  Вместе {formatDays(pair.daysTogether)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="divider my-4" />

        <label
          htmlFor="profile-name"
          className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint"
        >
          Отображаемое имя
        </label>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <span className="text-[10px] text-tg-hint">
            Видно партнёру в пространстве
          </span>
          <span
            className={`text-[11px] font-medium ${
              40 - name.trim().length < 8 ? 'text-rose-500' : 'text-tg-hint'
            }`}
          >
            {name.trim().length}/40
          </span>
        </div>
        <div className="mt-1.5 flex gap-2">
          <input
            id="profile-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value.slice(0, 40));
              setNameError(null);
            }}
            maxLength={40}
            disabled={nameSaving}
            placeholder="Ваше имя"
            className="field flex-1"
          />
          <button
            type="button"
            onClick={() => {
              void handleSaveName();
            }}
            disabled={nameSaving || !nameChanged || name.trim().length === 0}
            className="btn btn-primary shrink-0 px-4"
          >
            {nameSaving ? <Spinner size={16} /> : 'Сохранить'}
          </button>
        </div>
        {nameError ? (
          <p
            role="alert"
            className="mt-1.5 text-xs leading-5 text-rose-600 dark:text-rose-300"
          >
            {nameError}
          </p>
        ) : null}
      </section>

      {/* Дата отношений */}
      <section className="surface-solid rounded-[24px] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold leading-5 text-tg-text">
              Дата начала отношений
            </h2>
            <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
              {savedDate
                ? `Вместе с ${formatDate(savedDate)}`
                : 'Укажите дату — покажем, сколько вы вместе'}
            </p>
          </div>
          {savedDate ? (
            <button
              type="button"
              onClick={() => {
                setDate('');
                setDateTouched(true);
                setDateError(null);
              }}
              disabled={dateSaving}
              className="min-h-[44px] shrink-0 text-[11px] font-semibold text-tg-hint"
            >
              Убрать
            </button>
          ) : null}
        </div>

        <div className="mt-2 space-y-2">
          <input
            type="date"
            value={date}
            max={maxDate}
            min="1950-01-01"
            onChange={(event) => {
              setDate(event.target.value);
              setDateTouched(true);
              setDateError(null);
            }}
            disabled={dateSaving}
            aria-label="Дата начала отношений"
            className="field w-full"
          />
          <button
            type="button"
            onClick={() => {
              void handleSaveDate();
            }}
            disabled={dateSaving || !dateChanged}
            className="btn btn-secondary w-full"
          >
            {dateSaving ? <Spinner size={16} /> : null}
            Сохранить дату
          </button>
        </div>
        {dateError ? (
          <p
            role="alert"
            className="mt-1.5 text-xs leading-5 text-rose-600 dark:text-rose-300"
          >
            {dateError}
          </p>
        ) : null}
      </section>

      {/* Подписка */}
      <section className="overflow-hidden rounded-[24px] border border-slate-300/15 brand-gradient-soft p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint">
              Подписка пары
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold leading-6 text-tg-text">
              {planTitle(subscription.plan)}
              <PlanBadge plan={subscription.plan} size="sm" />
            </h2>
            {subscription.expiresAt ? (
              <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
                Активна до {formatDate(subscription.expiresAt)}
                {subscription.daysLeft !== null
                  ? ` · осталось ${subscription.daysLeft} дн.`
                  : ''}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
                Подписка откроет безлимиты и секретные подборки сразу для
                обоих партнёров
              </p>
            )}
          </div>
          <span aria-hidden="true" className="text-3xl">
            {subscription.isPro ? '✨' : '🎁'}
          </span>
        </div>

        {subscription.isTrial ? (
          <p className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
            Пробный период активен. Оформите PRO, чтобы сохранить безлимиты
            после его окончания.
          </p>
        ) : subscription.isPro ? (
          <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            У вас активен PRO — все лимиты сняты для обоих партнёров.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {!subscription.isPro || subscription.isTrial ? (
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                openPaywall('upsell');
              }}
              className="btn btn-primary flex-1"
            >
              {subscription.isTrial ? 'Оформить PRO' : 'Открыть PRO'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void handleSync();
            }}
            disabled={syncing}
            className="btn btn-secondary"
          >
            {syncing ? <Spinner size={16} /> : null}
            Проверить оплату
          </button>
        </div>
      </section>

      {/* Приглашение */}
      {pair ? (
        <section className="surface-solid rounded-[24px] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold leading-5 text-tg-text">
                {partner ? 'Ваша пара' : 'Приглашение партнёру'}
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
                {partner
                  ? `Партнёр: ${partner.firstName}${
                      partner.username ? ` (@${partner.username})` : ''
                    }`
                  : 'Отправьте ссылку, чтобы партнёр присоединился'}
              </p>
            </div>
            <span aria-hidden="true" className="text-2xl">
              💞
            </span>
          </div>

          <p className="mt-2.5 break-all rounded-xl bg-tg-secondary-bg/50 px-3 py-2 text-[11px] leading-4 text-tg-text/75">
            {pair.inviteLink}
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopyInvite();
              }}
              disabled={copying}
              className="btn btn-secondary flex-1"
            >
              {copying ? <Spinner size={16} /> : null}
              Скопировать ссылку
            </button>
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                const text = 'Присоединяйся ко мне в «Пространстве для двоих» 💞';
                openTelegramLink(
                  `https://t.me/share/url?url=${encodeURIComponent(
                    pair.inviteLink,
                  )}&text=${encodeURIComponent(text)}`,
                );
              }}
              className="btn btn-secondary flex-1"
            >
              Отправить
            </button>
          </div>

          {!partner ? (
            <p className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:text-amber-200">
              Ждём партнёра — приложение обновится автоматически, когда он
              присоединится.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Бот и поддержка */}
      <section className="surface-solid rounded-[24px] p-4">
        <button
          type="button"
          onClick={handleOpenBot}
          disabled={!config?.botUsername}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <span aria-hidden="true" className="text-xl">
              🤖
            </span>
            <span>
              <span className="block text-sm font-semibold text-tg-text">
                Открыть бота
              </span>
              <span className="block text-[11px] text-tg-hint">
                {config?.botUsername
                  ? `@${config.botUsername}`
                  : 'Помощь и уведомления'}
              </span>
            </span>
          </span>
          <span aria-hidden="true" className="text-tg-hint">
            →
          </span>
        </button>
      </section>

      {/* Отвязка */}
      <section className="pb-2">
        <button
          type="button"
          onClick={() => {
            hapticSelection();
            setLeaveOpen(true);
            setLeaveError(null);
          }}
          className="btn btn-danger w-full"
        >
          Отвязать пару
        </button>
        <p className="mt-2 text-center text-[10px] leading-4 text-tg-hint">
          Пространство для двоих · сделано с заботой 🫶
        </p>
      </section>

      <Modal
        open={leaveOpen}
        onClose={() => {
          if (!leaving) {
            setLeaveOpen(false);
            setLeaveError(null);
          }
        }}
        title="Отвязать пару?"
        description="Это действие удалит пространство у обоих партнёров."
        dismissible={!leaving}
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setLeaveOpen(false);
                setLeaveError(null);
              }}
              disabled={leaving}
              className="btn btn-secondary flex-1"
            >
              Оставить
            </button>
            <button
              type="button"
              onClick={() => {
                void handleLeave();
              }}
              disabled={leaving}
              className="btn btn-danger flex-1"
            >
              {leaving ? <Spinner size={16} /> : null}
              Отвязать
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-sm leading-6 text-tg-hint">
          <p>
            Пропадут общие мэтчи, напоминания, настроение и подписка пары.
            Вернуть данные будет невозможно.
          </p>
          <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
            Если вы хотите просто сделать паузу — закройте приложение. Данные
            сохранятся.
          </p>
          {leaveError ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
            >
              {leaveError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
