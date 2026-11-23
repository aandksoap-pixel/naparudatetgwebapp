import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { MatchInfo } from '@/types/api';
import { ItemImage } from './ItemImage';
import { hapticSuccess } from '@/lib/haptics';
import { openTelegramLink } from '@/lib/telegram';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';

interface MatchModalProps {
  match: MatchInfo | null;
  open: boolean;
  onClose: () => void;
}

function FloatingHeart({
  left,
  delay,
  emoji,
  children,
}: {
  left: string;
  delay: number;
  emoji: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 text-2xl opacity-70"
      style={{ left }}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: -520, opacity: [0, 0.85, 0] }}
      transition={{ duration: 6, delay, repeat: Infinity, ease: 'easeOut' }}
    >
      {emoji}
      {children}
    </motion.span>
  );
}

/** Full-screen поздравление с взаимным лайком. */
export function MatchModal({
  match,
  open,
  onClose,
}: MatchModalProps): JSX.Element | null {
  const { state, config } = useApp();
  const toast = useToast();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open && match) hapticSuccess();
  }, [open, match]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  const partnerName = state?.partner?.firstName ?? 'Партнёр';
  const myName = state?.user.firstName ?? 'Вы';

  const handleShare = (): void => {
    if (!match) return;
    const text = `Мы оба захотели «${match.itemTitle}» 💞 Присоединяйся к нам в «Пространстве для двоих»`;
    const url = config?.miniAppUrl ?? 'https://t.me';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      url,
    )}&text=${encodeURIComponent(text)}`;
    try {
      openTelegramLink(shareUrl);
    } catch {
      toast.error('Не удалось открыть Telegram для отправки');
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && match ? (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#be123c_0%,#4c0519_45%,#0f172a_100%)]" />
          <div
            aria-hidden="true"
            className="absolute -left-16 top-16 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -right-20 top-1/3 h-64 w-64 rounded-full bg-rose-500/25 blur-3xl"
          />

          <div className="safe-top-sm relative z-10 flex items-center justify-between px-5 pb-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              Взаимная симпатия
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="tap-scale flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm"
            >
              ✕
            </button>
          </div>

          <div className="safe-bottom-md scroll-area relative z-10 flex-1 px-6">
            <div className="flex min-h-full flex-col items-center justify-center py-4">
            {!reduceMotion ? (
              <>
                <FloatingHeart left="12%" delay={0} emoji="💗" />
                <FloatingHeart left="28%" delay={1.4} emoji="✨" />
                <FloatingHeart left="72%" delay={0.7} emoji="💞" />
                <FloatingHeart left="86%" delay={2.1} emoji="💫" />
              </>
            ) : null}

            <motion.div
              initial={reduceMotion ? undefined : { scale: 0.85, opacity: 0 }}
              animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
              className="relative w-[min(62vw,240px)]"
            >
              <div className="absolute -inset-4 rounded-[36px] bg-rose-500/30 blur-2xl" />
              <ItemImage
                title={match.itemTitle}
                category={match.category}
                poster={match.itemPoster}
                priority
                className="relative aspect-[3/4] w-full rounded-[28px] border border-white/20 shadow-2xl"
              />
            </motion.div>

            <motion.h1
              initial={reduceMotion ? undefined : { y: 12, opacity: 0 }}
              animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="mt-6 text-center text-[30px] font-extrabold leading-tight tracking-tight text-white"
            >
              ЭТО МЭТЧ! 🎉
            </motion.h1>

            <p className="mt-1.5 max-w-[300px] text-center text-[13px] leading-5 text-white/75">
              <span className="font-semibold text-white">{myName}</span> и{' '}
              <span className="font-semibold text-white">{partnerName}</span> оба
              захотели
            </p>
            <p className="mt-1 max-w-[300px] text-center text-lg font-bold leading-6 text-white">
              «{match.itemTitle}»
            </p>

            <div className="mt-7 w-full max-w-[320px] space-y-2.5">
              <button
                type="button"
                onClick={handleShare}
                className="btn w-full border-white/20 bg-white text-slate-900 hover:bg-white/90"
              >
                Отправить в чат
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn w-full border border-white/25 bg-white/10 text-white backdrop-blur-sm"
              >
                Продолжить
              </button>
            </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
