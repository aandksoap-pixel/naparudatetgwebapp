import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import type { LoveMessageInfo } from '@/types/api';
import { api, getErrorMessage, isApiError } from '@/lib/api';
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
interface RawLoveMessage {
  id: string;
  sender_id: number;
  receiver_id: number;
  text: string;
  created_at: string;
}

function fromRaw(row: RawLoveMessage): LoveMessageInfo {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function LoveTab(): JSX.Element {
  const { state, applyState, realtime } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<LoveMessageInfo[]>(
    state?.loveMessages ?? [],
  );

  const userId = state?.user.id ?? 0;
  const pairId = state?.pair?.id ?? null;

  useEffect(() => {
    const incoming = state?.loveMessages;
    if (!incoming || incoming.length === 0) return;
    setMessages((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of incoming) byId.set(item.id, item);
      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
  }, [state?.loveMessages]);

  // Прямой канал с Supabase: позволяет получать сообщения мгновенно даже
  // до деплоя последней версии backend. Backend при наличии также шлёт бота.
  useEffect(() => {
    if (!realtime || !pairId) return;
    let cancelled = false;
    const client = createClient(realtime.url, realtime.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${realtime.token}` },
      },
    });
    const headers = {
      apikey: realtime.anonKey,
      Authorization: `Bearer ${realtime.token}`,
    };

    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${realtime.url}/rest/v1/love_messages?pair_id=eq.${encodeURIComponent(pairId)}&select=*&order=created_at.desc&limit=50`,
          { headers },
        );
        if (!response.ok) return;
        const rows = (await response.json()) as RawLoveMessage[];
        if (!cancelled && Array.isArray(rows)) {
          setMessages(rows.map(fromRaw));
        }
      } catch {
        /* direct path optional; API state remains */
      }
    };

    void (async () => {
      try {
        await client.realtime.setAuth(realtime.token);
      } catch {
        /* public channel still optional */
      }
      if (cancelled) return;
      client
        .channel(`love:${pairId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'love_messages',
            filter: `pair_id=eq.${pairId}`,
          },
          (payload) => {
            const row = payload.new as RawLoveMessage;
            if (!row?.id) return;
            const next = fromRaw(row);
            setMessages((current) =>
              current.some((item) => item.id === next.id) ? current : [next, ...current],
            );
          },
        )
        .subscribe();
    })();

    void load();

    return () => {
      cancelled = true;
      void client.removeAllChannels();
      void client.realtime.disconnect();
    };
  }, [pairId, realtime]);

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
      try {
        const response = await api.sendLove(trimmed);
        applyState(response.state);
        setMessages((current) =>
          current.some((item) => item.id === response.message.id)
            ? current
            : [response.message, ...current],
        );
      } catch (caught) {
        // Если backend ещё старой версии и /api/love отсутствует, отправляем
        // напрямую через защищённый Supabase RPC (RLS + Realtime JWT).
        if (!isApiError(caught) || caught.status !== 404 || !realtime) throw caught;
        const response = await fetch(`${realtime.url}/rest/v1/rpc/app_send_love`, {
          method: 'POST',
          headers: {
            apikey: realtime.anonKey,
            Authorization: `Bearer ${realtime.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_text: trimmed }),
        });
        if (!response.ok) {
          throw new Error(`Не удалось отправить сообщение (${response.status})`);
        }
        const row = (await response.json()) as RawLoveMessage;
        const message = fromRaw(row);
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [message, ...current],
        );
      }
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
