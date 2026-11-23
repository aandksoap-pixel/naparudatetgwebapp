import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastApi {
  toast: (message: string, type?: ToastType, durationMs?: number) => number;
  success: (message: string, durationMs?: number) => number;
  error: (message: string, durationMs?: number) => number;
  info: (message: string, durationMs?: number) => number;
  warning: (message: string, durationMs?: number) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 3800;
const MAX_VISIBLE = 3;

const TOAST_STYLES: Record<
  ToastType,
  { icon: string; wrapper: string }
> = {
  success: {
    icon: '✅',
    wrapper: 'border-emerald-400/30 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-50',
  },
  error: {
    icon: '⚠️',
    wrapper: 'border-rose-400/40 bg-rose-50/95 text-rose-950 dark:bg-rose-950/90 dark:text-rose-50',
  },
  warning: {
    icon: '⏳',
    wrapper: 'border-amber-400/40 bg-amber-50/95 text-amber-950 dark:bg-amber-950/90 dark:text-amber-50',
  },
  info: {
    icon: '💬',
    wrapper: 'border-sky-400/30 bg-sky-50/95 text-sky-950 dark:bg-sky-950/90 dark:text-sky-50',
  },
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number): void => {
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      durationMs: number = DEFAULT_DURATION,
    ): number => {
      counterRef.current += 1;
      const id = counterRef.current;
      setToasts((current) => {
        const next = [...current, { id, message, type }];
        if (next.length > MAX_VISIBLE) {
          const removed = next.shift();
          if (removed) {
            const timerId = timersRef.current.get(removed.id);
            if (timerId !== undefined) {
              window.clearTimeout(timerId);
              timersRef.current.delete(removed.id);
            }
          }
        }
        return next;
      });
      const timerId = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, durationMs);
      timersRef.current.set(id, timerId);
      return id;
    },
    [],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message, durationMs) => toast(message, 'success', durationMs),
      error: (message, durationMs) => toast(message, 'error', durationMs),
      info: (message, durationMs) => toast(message, 'info', durationMs),
      warning: (message, durationMs) => toast(message, 'warning', durationMs),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
      >
        <div className="flex w-full max-w-[430px] flex-col items-stretch gap-2">
          <AnimatePresence initial={false}>
            {toasts.map((item) => {
              const style = TOAST_STYLES[item.type];
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  onClick={() => dismiss(item.id)}
                  className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-soft backdrop-blur-xl ${style.wrapper}`}
                  role={item.type === 'error' ? 'alert' : 'status'}
                >
                  <span aria-hidden="true" className="text-base leading-5">
                    {style.icon}
                  </span>
                  <span className="min-w-0 flex-1 break-words leading-5">
                    {item.message}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return value;
}
