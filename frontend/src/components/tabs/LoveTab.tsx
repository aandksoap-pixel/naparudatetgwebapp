import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { hapticError, hapticSelection, hapticSuccess } from '@/lib/haptics';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/Avatar';
import { Spinner } from '@/components/LoadingScreen';

const QUICK_MESSAGES: ReadonlyArray<{ emoji: string; text: string }> = [
  { emoji: '❤️', text: 'Я тебя люблю' },
  { emoji: '🥺', text: 'Очень скучаю' },
  { emoji: '💫', text: 'Жду тебя' },
  { emoji: '🫂', text: 'Обнимаю крепко' },
  { emoji: '🌟', text: 'Ты лучший(ая) на свете' },
  { emoji: '💭', text: 'Думаю о тебе' },
  { emoji: '💖', text: 'Ты — моё всё' },
  { emoji: '☕', text: 'Хочу провести с тобой весь день' },
];

/** Раздел «Любовь»: тёплые сообщения без повода и напоминаний. */
export function LoveTab(): JSX.Element {
  const { state, applyState } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const userId = state?.user.id ?? 0;
  const messages = state?.loveMessages ?? [];

  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [messages],
  );

  const send = async (message: string): Promise<void> => {
    const trimmed = message.trim();
    if (!trimmed || sending) {
      if (!trimmed) hapticError();
      return;
    }
    if (trimmed.length > 300) {
      toast.error('Максимум 300 символов');
      return;
    }
    setSending(true);
    hapticSelection();
    try {
      const response = await api.sendLove(trimmed);
      applyState(response.state);
      setText('');
      hapticSuccess();
      toast.success('Передано партнёру 💌');
    } catch (caught) {
      hapticError();
      toast.error(getErrorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-3">
      <section className="overflow-hidden rounded-[26px] border border-rose-300/25 brand-gradient-soft p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl">
            💌
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-6 text-tg-text">
              Поделиться любовью
            </h2>
            <p className="mt-0.5 text-[11px] leading-4 text-tg-hint">
              Просто так. Без повода и напоминаний — партнёр сразу получит сообщение в Telegram.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {QUICK_MESSAGES.map((quick) => (
            <motion.button
              key={quick.text}
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              onClick={() => {
                hapticSelection();
                void send(`${quick.emoji} ${quick.text}`);
              }}
              disabled={sending}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-white/40 bg-white/35 px-2.5 py-2 text-left text-[11px] font-semibold leading-4 text-tg-text backdrop-blur-sm disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
            >
              <span aria-hidden="true" className="text-base">
                {quick.emoji}
              </span>
              {quick.text}
            </motion.button>
          ))}
        </div>
      </section>

      <section className="surface-solid rounded-[24px] p-4">
        <div className="flex items-center justify-between">
          <label
            htmlFor="love-text"
            className="text-[11px] font-semibold uppercase tracking-[0.15em] text-tg-hint"
          >
            Своими словами
          </label>
          <span className="text-[11px] text-tg-hint">{text.length}/300</span>
        </div>
        <textarea
          id="love-text"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 300))}
          rows={3}
          maxLength={300}
          placeholder="Напиши что-то тёплое…"
          disabled={sending}
          className="field mt-1.5"
        />
        <button
          type="button"
          onClick={() => void send(text)}
          disabled={sending || text.trim().length === 0}
          className="btn btn-brand mt-2.5 w-full"
        >
          {sending ? <Spinner size={16} /> : <span aria-hidden="true">💌</span>}
          Отправить партнёру
        </button>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold leading-6 text-tg-text">
            Наши тёплые слова
          </h2>
          <span className="text-[11px] text-tg-hint">{sorted.length}</span>
        </div>

        {sorted.length > 0 ? (
          <div className="mt-2 space-y-2">
            {sorted.map((message) => {
              const incoming = message.senderId !== userId;
              const person = incoming ? state?.partner : state?.user;
              return (
                <div
                  key={message.id}
                  className={`rounded-2xl border p-3 ${
                    incoming
                      ? 'border-rose-300/20 bg-rose-500/[0.06]'
                      : 'border-slate-300/15 bg-tg-secondary-bg/35'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={person?.firstName ?? 'Партнёр'}
                      src={person?.avatarUrl ?? null}
                      size={28}
                    />
                    <p className="text-[10px] font-semibold text-tg-hint">
                      {incoming ? 'От партнёра' : 'От тебя'} · {formatRelative(message.createdAt)}
                    </p>
                    <span className="ml-auto text-[9px] text-tg-hint/70">
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-5 text-tg-text">
                    {message.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-dashed border-rose-300/25 bg-rose-500/[0.03] px-4 py-8 text-center">
            <span aria-hidden="true" className="text-3xl">
              💞
            </span>
            <p className="mt-2 text-sm font-semibold text-tg-text">
              Здесь появятся ваши тёплые слова
            </p>
            <p className="mt-1 text-xs leading-5 text-tg-hint">
              Отправь первое сообщение — просто так.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
