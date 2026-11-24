import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { api, getErrorMessage } from '@/lib/api';
import { buildPairInviteLink } from '@/lib/format';
import {
  copyText,
  openTelegramLink,
} from '@/lib/telegram';
import {
  hapticError,
  hapticImpact,
  hapticSelection,
  hapticSuccess,
} from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Spinner } from './LoadingScreen';
import { Modal } from './Modal';

function ShareIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function CopyIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16V4a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

/** Создание пространства, ожидание партнёра и отвязка пары. */
export function OnboardingPair(): JSX.Element {
  const { state, applyState, refreshSession, config } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  if (!state) {
    return <div className="min-h-[var(--app-height)]" />;
  }

  const { pair } = state;
  const inviteLink = pair
    ? buildPairInviteLink(config?.botUsername, pair.inviteCode)
    : null;

  const handleCreate = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    hapticImpact('medium');
    try {
      const response = await api.createPair();
      applyState(response.state);
      await refreshSession();
      hapticSuccess();
      toast.success('Пространство создано! Осталось позвать партнёра 💞');
    } catch (error) {
      const message = getErrorMessage(error);
      setCreateError(message);
      hapticError();
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (): Promise<void> => {
    if (joining) return;
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Введите код приглашения — например, PAIR_A1B2C3');
      return;
    }
    setJoining(true);
    setJoinError(null);
    hapticImpact('medium');
    try {
      const response = await api.joinPair(code);
      applyState(response.state);
      await refreshSession();
      hapticSuccess();
      toast.success('Вы присоединились к паре 💞');
    } catch (error) {
      const message = getErrorMessage(error);
      setJoinError(message);
      hapticError();
      toast.error(message);
    } finally {
      setJoining(false);
    }
  };

  const handleCopyLink = async (): Promise<void> => {
    if (!pair || !inviteLink) return;
    const copiedOk = await copyText(inviteLink);
    if (copiedOk) {
      hapticSelection();
      setCopied(true);
      toast.success('Ссылка скопирована');
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2200);
    } else {
      hapticError();
      toast.error('Не удалось скопировать. Выделите ссылку вручную.');
    }
  };

  const handleShare = (): void => {
    if (!pair || !inviteLink) return;
    hapticImpact('light');
    const text = 'Присоединяйся ко мне в «Пространстве для двоих» 💞';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      inviteLink,
    )}&text=${encodeURIComponent(text)}`;
    openTelegramLink(shareUrl);
  };

  const handleLeave = async (): Promise<void> => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      const response = await api.leavePair();
      applyState(response.state);
      await refreshSession();
      setLeaveOpen(false);
      hapticSuccess();
      toast.success('Пара отвязана. Можно создать новое пространство.');
    } catch (error) {
      const message = getErrorMessage(error);
      setLeaveError(message);
      hapticError();
      toast.error(message);
    } finally {
      setLeaving(false);
    }
  };

  /* -------------------------------------------------------------- */
  /* Ожидание партнёра                                              */
  /* -------------------------------------------------------------- */
  if (pair) {
    return (
      <div className="flex min-h-[var(--app-height)] w-full flex-col">
        <div className="safe-top-md safe-bottom-xl mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4">
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={reduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
              animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="brand-gradient flex h-20 w-20 items-center justify-center rounded-[28px] text-4xl shadow-glow"
            >
              💌
            </motion.div>
            <h1 className="mt-5 text-[26px] font-extrabold leading-8 tracking-tight text-tg-text">
              Пространство создано
            </h1>
            <p className="mt-2 max-w-[300px] text-sm leading-6 text-tg-hint">
              Отправьте ссылку партнёру — и вы вместе откроете фильмы, еду и
              заботу друг о друге.
            </p>
          </div>

          <div className="surface-solid mt-7 rounded-[26px] p-5 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tg-hint">
              Код приглашения
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="min-w-0 break-all font-mono text-xl font-bold tracking-[0.14em] text-tg-text">
                {pair.inviteCode}
              </p>
              <button
                type="button"
                onClick={() => {
                  void copyText(pair.inviteCode).then((ok) => {
                    if (ok) {
                      hapticSelection();
                      toast.success('Код скопирован');
                    } else {
                      hapticError();
                      toast.error('Не удалось скопировать код');
                    }
                  });
                }}
                aria-label="Скопировать код приглашения"
                className="tap-scale flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tg-secondary-bg text-tg-hint"
              >
                <CopyIcon />
              </button>
            </div>

            <div className="divider my-4" />

            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tg-hint">
              Ссылка
            </p>
            <p className="mt-1.5 break-all text-xs leading-5 text-tg-text/80">
              {inviteLink}
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={handleShare}
                className="btn btn-primary w-full"
              >
                <ShareIcon />
                Отправить партнёру в Telegram
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCopyLink();
                }}
                className="btn btn-secondary w-full"
              >
                {copied ? '✅ Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-slate-300/30 bg-tg-secondary-bg/30 px-5 py-5 text-center">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
              <p className="text-sm font-semibold text-tg-text">
                Ждём партнёра…
              </p>
            </div>
            <p className="max-w-[280px] text-xs leading-5 text-tg-hint">
              Как только партнёр откроет ссылку, приложение обновится
              автоматически — перезапускать ничего не нужно.
            </p>
          </div>

          <div className="mt-auto pt-8">
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                setLeaveOpen(true);
              }}
              className="btn btn-ghost mx-auto w-full max-w-[260px] text-sm text-tg-destructive"
            >
              Отвязаться
            </button>
          </div>
        </div>

        <Modal
          open={leaveOpen}
          onClose={() => {
            if (!leaving) {
              setLeaveOpen(false);
              setLeaveError(null);
            }
          }}
          title="Отменить приглашение?"
          description="Пространство и код приглашения будут удалены. Создать новое можно в любой момент."
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
                Отвязаться
              </button>
            </div>
          }
        >
          {leaveError ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
            >
              {leaveError}
            </p>
          ) : (
            <p className="text-sm leading-6 text-tg-hint">
              Вы уверены? Если партнёр ещё не присоединился, ссылка перестанет
              работать.
            </p>
          )}
        </Modal>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* Создание пространства                                          */
  /* -------------------------------------------------------------- */
  return (
    <div className="flex min-h-[var(--app-height)] w-full flex-col">
      <div className="safe-top-lg safe-bottom-lg mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4">
        <div className="relative overflow-hidden rounded-[30px] border border-white/10 brand-gradient-soft px-5 pb-6 pt-7 text-center shadow-soft">
          <span
            aria-hidden="true"
            className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-rose-400/25 blur-2xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl"
          />
          <div className="brand-gradient relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-[24px] text-[34px] shadow-glow">
            🫶
          </div>
          <p className="relative mt-4 inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 dark:bg-white/10 dark:text-rose-200">
            Только для двоих
          </p>
          <h1 className="relative mt-3 text-[28px] font-extrabold leading-9 tracking-tight text-tg-text">
            Пространство
            <br />
            <span className="text-gradient-brand">для двоих</span>
          </h1>
          <p className="relative mx-auto mt-2.5 max-w-[300px] text-sm leading-6 text-tg-hint">
            Приватное место, где вы вместе выбираете фильмы и еду, делитесь
            настроением и заботитесь друг о друге.
          </p>
        </div>

        <div className="mt-5 space-y-2.5">
          {[
            {
              icon: '🎬',
              title: 'Свайпайте вместе',
              text: 'Фильмы и еда: совпавшие желания становятся мэтчами.',
            },
            {
              icon: '💭',
              title: 'Будьте на одной волне',
              text: 'Настроение партнёра обновляется в реальном времени.',
            },
            {
              icon: '🔔',
              title: 'Заботьтесь словами',
              text: 'Отправляйте напоминания и поддержку в один тап.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 rounded-2xl border border-slate-300/15 bg-tg-secondary-bg/40 px-3.5 py-3"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-bg/70 text-lg"
              >
                {feature.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-5 text-tg-text">
                  {feature.title}
                </p>
                <p className="text-[11px] leading-5 text-tg-hint">
                  {feature.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={() => {
              void handleCreate();
            }}
            disabled={creating}
            className="btn btn-primary w-full text-base"
          >
            {creating ? <Spinner size={18} /> : <span aria-hidden="true">💞</span>}
            Создать пространство
          </button>
          <p className="mt-2 text-center text-[11px] leading-4 text-tg-hint">
            Одна подписка PRO — сразу для вас двоих. Начните бесплатно.
          </p>

          {createError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
            >
              {createError}
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          {!joinOpen ? (
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                setJoinOpen(true);
              }}
              className="btn btn-ghost mx-auto w-full text-sm"
            >
              У меня есть код приглашения
            </button>
          ) : (
            <div className="surface-solid rounded-2xl p-3.5">
              <label
                htmlFor="invite-code"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tg-hint"
              >
                Код приглашения
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="invite-code"
                  value={inviteCode}
                  onChange={(event) => {
                    setInviteCode(event.target.value.toUpperCase());
                    setJoinError(null);
                  }}
                  placeholder="PAIR_A1B2C3"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                  disabled={joining}
                  className="field flex-1 font-mono uppercase tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleJoin();
                  }}
                  disabled={joining || inviteCode.trim().length === 0}
                  className="btn btn-primary shrink-0 px-4"
                >
                  {joining ? <Spinner size={16} /> : 'Войти'}
                </button>
              </div>
              {joinError ? (
                <p
                  role="alert"
                  className="mt-2 text-xs leading-5 text-rose-600 dark:text-rose-300"
                >
                  {joinError}
                </p>
              ) : (
                <p className="mt-2 text-[11px] leading-4 text-tg-hint">
                  Вставьте код или откройте ссылку-приглашение от партнёра.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-auto pt-6 text-center text-[10px] leading-4 text-tg-hint">
          Ваши данные видны только вам и партнёру
        </p>
      </div>
    </div>
  );
}
