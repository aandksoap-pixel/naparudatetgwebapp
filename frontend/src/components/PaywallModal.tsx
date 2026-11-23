import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, PaymentPlan, PaywallReason } from '@/types/api';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import {
  formatDate,
  formatPriceRub,
  formatStars,
  planTitle,
} from '@/lib/format';
import {
  hapticError,
  hapticImpact,
  hapticSuccess,
  hapticWarning,
} from '@/lib/haptics';
import { openExternalLink, openInvoice } from '@/lib/telegram';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Modal } from './Modal';
import { Spinner } from './LoadingScreen';

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 120_000;

const BENEFITS = [
  'Безлимитные свайпы фильмов и еды каждый день',
  'Безлимит напоминаний партнёру',
  'Секретные подборки фильмов',
  '1 подписка сразу для двоих',
] as const;

const REASON_CONTENT: Record<
  PaywallReason,
  { emoji: string; title: string; description: string }
> = {
  movie: {
    emoji: '🎬',
    title: 'Лимит фильмов на сегодня',
    description:
      'Бесплатно можно посмотреть 5 фильмов в день на пару. PRO снимает лимит для вас обоих.',
  },
  food: {
    emoji: '🍕',
    title: 'Лимит еды на сегодня',
    description:
      'Бесплатно доступно 2 блюда в день на пару. С PRO выбор становится безлимитным.',
  },
  reminder: {
    emoji: '🔔',
    title: 'Лимит напоминаний',
    description:
      'Бесплатно можно отправить 3 напоминания в день. PRO позволяет заботиться без счёта.',
  },
  upsell: {
    emoji: '✨',
    title: 'PRO для вас двоих',
    description:
      'Одна подписка на пару: безлимиты, секретные подборки и все возможности приложения.',
  },
};

const TRIAL_NOTE = 'Без списания. Отмена в любой момент.';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

interface PlanCardProps {
  plan: PaymentPlan;
  title: string;
  price: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({
  plan,
  title,
  price,
  badge,
  selected,
  onSelect,
}: PlanCardProps): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative flex min-h-[104px] flex-col items-start justify-between rounded-2xl border p-3 text-left transition-colors ${
        selected
          ? 'border-tg-button bg-tg-button/10 shadow-soft'
          : 'border-slate-300/25 bg-tg-secondary-bg/50'
      }`}
    >
      {badge ? (
        <span className="absolute -top-2 right-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-soft">
          {badge}
        </span>
      ) : null}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint">
        {title}
      </span>
      <span className="mt-1 text-[17px] font-extrabold leading-5 text-tg-text">
        {price}
      </span>
      <span
        className={`mt-2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
          selected
            ? 'border-tg-button bg-tg-button text-tg-button-text'
            : 'border-slate-400/40 text-transparent'
        }`}
        aria-hidden="true"
      >
        ✓
      </span>
      <span className="sr-only">{plan === 'monthly' ? 'Месяц' : 'Год'}</span>
    </button>
  );
}

/** Paywall: триал, тарифы, Telegram Stars и ЮKassa со всеми состояниями. */
export function PaywallModal(): JSX.Element | null {
  const {
    state,
    config,
    paywallReason,
    closePaywall,
    applyState,
    refresh,
  } = useApp();
  const toast = useToast();

  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>('monthly');
  const [trialLoading, setTrialLoading] = useState(false);
  const [starsLoading, setStarsLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [awaitingNotice, setAwaitingNotice] = useState<string | null>(null);

  const syncInFlightRef = useRef(false);
  const successRef = useRef(false);

  const open = Boolean(paywallReason && state && config);

  const markSuccess = useCallback(
    (nextState: AppState): void => {
      if (successRef.current) return;
      successRef.current = true;
      applyState(nextState);
      setAwaitingPayment(false);
      setAwaitingNotice(null);
      setError(null);
      hapticSuccess();
      toast.success('PRO активирован! Теперь без границ ✨');
      closePaywall();
    },
    [applyState, closePaywall, toast],
  );

  const syncPayment = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (syncInFlightRef.current || successRef.current) return false;
      syncInFlightRef.current = true;
      if (!silent) setChecking(true);
      try {
        const response = await api.syncSubscription();
        applyState(response.state);
        if (response.state.subscription.isPro) {
          markSuccess(response.state);
          return true;
        }
        if (!response.pending) {
          setAwaitingPayment(false);
          setAwaitingNotice(
            'Платёж пока не подтверждён. Если оплата прошла, нажмите «Проверить оплату».',
          );
        }
        return false;
      } catch (caught) {
        if (!silent) setError(getErrorMessage(caught));
        return false;
      } finally {
        syncInFlightRef.current = false;
        if (!silent) setChecking(false);
      }
    },
    [applyState, markSuccess],
  );

  /* Сброс состояния при каждом новом открытии paywall. */
  useEffect(() => {
    if (!paywallReason) return;
    successRef.current = false;
    setSelectedPlan('monthly');
    setError(null);
    setAwaitingPayment(false);
    setAwaitingNotice(null);
    setTrialLoading(false);
    setStarsLoading(false);
    setCardLoading(false);
    setChecking(false);
    hapticWarning();
  }, [paywallReason]);

  /* Поллинг после оплаты картой: каждые 5 секунд и при возврате в приложение. */
  useEffect(() => {
    if (!awaitingPayment || !paywallReason) return;
    let stopped = false;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
        window.clearInterval(timer);
        setAwaitingPayment(false);
        setAwaitingNotice(
          'Платёж пока не подтверждён. Если оплата прошла, нажмите «Проверить оплату».',
        );
        return;
      }
      void syncPayment(true);
    }, POLL_INTERVAL_MS);

    const handleVisible = (): void => {
      if (document.visibilityState === 'visible') void syncPayment(true);
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [awaitingPayment, paywallReason, syncPayment]);

  if (!state || !config) return null;

  const reason = paywallReason;
  const content = reason ? REASON_CONTENT[reason] : REASON_CONTENT.upsell;
  const { subscription } = state;
  const trialUsed = state.pair?.trialUsed ?? subscription.trialUsed;
  const trialAvailable =
    !subscription.isPro && !subscription.isTrial && !trialUsed;

  const selectedRub =
    selectedPlan === 'monthly'
      ? config.prices.monthlyRub
      : config.prices.yearlyRub;
  const selectedStars =
    selectedPlan === 'monthly'
      ? config.prices.starsMonthly
      : config.prices.starsYearly;
  const yearlyPerMonth = Math.round(config.prices.yearlyRub / 12);

  const handleClose = (): void => {
    if (checking || trialLoading) return;
    closePaywall();
  };

  const handleTrial = async (): Promise<void> => {
    if (trialLoading) return;
    setTrialLoading(true);
    setError(null);
    hapticImpact('medium');
    try {
      const response = await api.activateTrial();
      markSuccess(response.state);
    } catch (caught) {
      hapticError();
      if (isApiError(caught) && caught.code === 'TRIAL_USED') {
        toast.info('Пробный период уже использован');
        await refresh();
        setError('Пробный период уже был использован. Выберите тариф.');
      } else {
        setError(getErrorMessage(caught));
      }
    } finally {
      setTrialLoading(false);
    }
  };

  const handleStars = async (): Promise<void> => {
    if (starsLoading) return;
    setStarsLoading(true);
    setError(null);
    hapticImpact('medium');
    try {
      const { invoiceLink } = await api.createStarsInvoice(selectedPlan);
      openInvoice(invoiceLink, (status) => {
        if (status === 'paid') {
          toast.info('Оплата получена, активируем PRO…');
          void (async () => {
            for (let attempt = 0; attempt < 4; attempt += 1) {
              await wait(1200);
              const activated = await syncPayment(attempt === 0 ? false : true);
              if (activated) {
                setStarsLoading(false);
                return;
              }
            }
            setStarsLoading(false);
            setAwaitingPayment(true);
            setAwaitingNotice(
              'Платёж обрабатывается. Проверяем автоматически — можно закрыть это окно.',
            );
          })();
          return;
        }
        setStarsLoading(false);
        if (status === 'cancelled') {
          toast.info('Оплата отменена');
        } else if (status === 'failed') {
          hapticError();
          toast.error('Оплата не прошла. Попробуйте другой способ.');
        } else {
          toast.info('Оплата ещё обрабатывается');
          setAwaitingPayment(true);
        }
      });
    } catch (caught) {
      setStarsLoading(false);
      hapticError();
      setError(getErrorMessage(caught));
    }
  };

  const handleCard = async (): Promise<void> => {
    if (cardLoading) return;
    setCardLoading(true);
    setError(null);
    hapticImpact('medium');
    try {
      const response = await api.createYookassaPayment(selectedPlan);
      openExternalLink(response.confirmationUrl);
      setAwaitingPayment(true);
      setAwaitingNotice(
        'Вернитесь в приложение после оплаты — PRO активируется автоматически.',
      );
      toast.info('Открыли страницу оплаты. После оплаты вернитесь сюда.');
    } catch (caught) {
      hapticError();
      setError(getErrorMessage(caught));
    } finally {
      setCardLoading(false);
    }
  };

  const handleCheck = async (): Promise<void> => {
    hapticImpact('light');
    const activated = await syncPayment(false);
    if (!activated && !successRef.current) {
      toast.info('Платёж пока не подтверждён. Попробуйте через несколько секунд.');
    }
  };

  /* ------------------------------------------------------------ */
  /* PRO уже активен                                              */
  /* ------------------------------------------------------------ */
  if (subscription.isPro && !subscription.isTrial) {
    return (
      <Modal
        open={open}
        onClose={closePaywall}
        variant="sheet"
        title="У вас активен PRO"
        description="Все возможности уже доступны вам двоим."
      >
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl">
              {subscription.isTrial ? '🎁' : '✨'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-tg-text">
                {subscription.isTrial ? 'Пробный период PRO' : planTitle(subscription.plan)}
              </p>
              {subscription.expiresAt ? (
                <p className="mt-0.5 text-xs leading-5 text-tg-hint">
                  До {formatDate(subscription.expiresAt)}
                  {subscription.daysLeft !== null
                    ? ` · осталось ${subscription.daysLeft} дн.`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-2 text-xs leading-5 text-tg-text"
            >
              <span aria-hidden="true" className="text-emerald-500">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={closePaywall}
          className="btn btn-primary mt-5 w-full"
        >
          Отлично
        </button>
      </Modal>
    );
  }

  /* ------------------------------------------------------------ */
  /* Paywall                                                      */
  /* ------------------------------------------------------------ */
  return (
    <Modal
      open={open}
      onClose={handleClose}
      variant="sheet"
      title={content.title}
      description={content.description}
      dismissible={!trialLoading}
    >
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-rose-300/20 brand-gradient-soft px-3.5 py-3">
        <span aria-hidden="true" className="text-2xl">
          {content.emoji}
        </span>
        <p className="min-w-0 flex-1 text-xs font-semibold leading-5 text-tg-text">
          {reason === 'upsell'
            ? 'Одна подписка — для вас обоих'
            : 'Откройте безлимит для вашей пары'}
        </p>
        {subscription.isTrial && subscription.expiresAt ? (
          <span className="ml-auto whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
            до {formatDate(subscription.expiresAt)}
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {awaitingNotice ? (
        <div className="mt-3 rounded-xl border border-sky-300/30 bg-sky-500/10 px-3 py-2.5">
          <p className="text-xs leading-5 text-sky-700 dark:text-sky-200">
            {awaitingNotice}
          </p>
          <button
            type="button"
            onClick={() => {
              void handleCheck();
            }}
            disabled={checking}
            className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-tg-link"
          >
            {checking ? <Spinner size={12} /> : null}
            Проверить оплату
          </button>
        </div>
      ) : null}

      {awaitingPayment && !awaitingNotice ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-sky-300/30 bg-sky-500/10 px-3 py-2.5">
          <Spinner size={16} className="text-sky-500" />
          <div>
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-200">
              Ожидаем оплату…
            </p>
            <p className="text-[10px] leading-4 text-tg-hint">
              Проверяем автоматически каждые 5 секунд
            </p>
          </div>
        </div>
      ) : null}

      {trialAvailable ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              void handleTrial();
            }}
            disabled={trialLoading || awaitingPayment}
            className="btn btn-brand w-full text-base"
          >
            {trialLoading ? <Spinner size={18} /> : <span aria-hidden="true">🎁</span>}
            Попробовать PRO бесплатно {config.trialDays} дня
          </button>
          <p className="mt-1.5 text-center text-[10px] leading-4 text-tg-hint">
            {TRIAL_NOTE}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint">
            {trialAvailable ? 'Или сразу PRO' : 'Выберите тариф'}
          </p>
          <span className="text-[10px] text-tg-hint">На пару</span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <PlanCard
            plan="monthly"
            title="Месяц"
            price={`${formatPriceRub(config.prices.monthlyRub)}/мес`}
            selected={selectedPlan === 'monthly'}
            onSelect={() => {
              hapticImpact('light');
              setSelectedPlan('monthly');
            }}
          />
          <PlanCard
            plan="yearly"
            title="Год"
            price={`${formatPriceRub(config.prices.yearlyRub)}/год`}
            badge={`Выгодно — ${yearlyPerMonth} ₽/мес`}
            selected={selectedPlan === 'yearly'}
            onSelect={() => {
              hapticImpact('light');
              setSelectedPlan('yearly');
            }}
          />
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {BENEFITS.map((benefit) => (
          <li
            key={benefit}
            className="flex items-start gap-2 text-xs leading-5 text-tg-text"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-300"
            >
              ✓
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => {
            void handleStars();
          }}
          disabled={starsLoading || awaitingPayment || trialLoading}
          className="btn btn-primary w-full"
        >
          {starsLoading ? (
            <Spinner size={18} />
          ) : (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-sm font-semibold">
                Оплатить ⭐ Telegram Stars
              </span>
              <span className="text-[11px] font-medium opacity-80">
                {formatStars(selectedStars)} · для вашей пары
              </span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            void handleCard();
          }}
          disabled={cardLoading || awaitingPayment || trialLoading}
          className="btn btn-secondary w-full"
        >
          {cardLoading ? (
            <Spinner size={18} />
          ) : (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-sm font-semibold">
                Оплатить картой / СБП
              </span>
              <span className="text-[11px] font-medium text-tg-hint">
                {formatPriceRub(selectedRub)} · без автопродления
              </span>
            </span>
          )}
        </button>

        {awaitingPayment ? (
          <button
            type="button"
            onClick={() => {
              void handleCheck();
            }}
            disabled={checking}
            className="btn btn-ghost w-full"
          >
            {checking ? <Spinner size={16} /> : null}
            Проверить оплату
          </button>
        ) : null}
      </div>

      <p className="mt-3 pb-1 text-center text-[10px] leading-4 text-tg-hint">
        Оплата безопасна. Подписка действует на обоих партнёров.
      </p>
    </Modal>
  );
}
