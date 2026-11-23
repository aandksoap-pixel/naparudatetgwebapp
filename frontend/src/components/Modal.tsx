import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from 'framer-motion';

type ModalVariant = 'center' | 'sheet';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: ModalVariant;
  dismissible?: boolean;
  showClose?: boolean;
  contentClassName?: string;
}

/**
 * Единая модалка: центр (подтверждения) и bottom sheet (мэтчи, paywall).
 * Блокирует скролл фона, закрывается по backdrop / Escape / свайпу за ручку.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  dismissible = true,
  showClose = true,
  contentClassName = '',
}: ModalProps): JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const isSheet = variant === 'sheet';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      panelRef.current?.focus({ preventScroll: true });
    }, 60);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, dismissible]);

  if (typeof document === 'undefined') return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget && dismissible) {
      onClose();
    }
  };

  const handleDragHandlePointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (isSheet && dismissible) {
      dragControls.start(event);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className={`fixed inset-0 z-[80] flex justify-center ${
            isSheet ? 'items-end' : 'items-center'
          }`}
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleBackdropClick}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            drag={isSheet && dismissible ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (!dismissible) return;
              if (info.offset.y > 90 || info.velocity.y > 650) onClose();
            }}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : isSheet
                  ? { y: '100%' }
                  : { opacity: 0, y: 24, scale: 0.97 }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isSheet
                  ? { y: 0 }
                  : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : isSheet
                  ? { y: '100%' }
                  : { opacity: 0, y: 18, scale: 0.97 }
            }
            transition={
              reduceMotion
                ? { duration: 0.12 }
                : { type: 'spring', stiffness: 380, damping: 34 }
            }
            className={`relative flex w-full max-w-[520px] flex-col overflow-hidden bg-tg-bg shadow-card outline-none ${
              isSheet
                ? 'max-h-[90vh] rounded-t-[28px] border border-b-0 border-slate-300/20'
                : 'm-4 max-h-[88vh] rounded-[28px] border border-slate-300/20'
            }`}
            style={isSheet ? { paddingBottom: 'var(--safe-bottom)' } : undefined}
          >
            {isSheet ? (
              <div
                className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 active:cursor-grabbing"
                onPointerDown={handleDragHandlePointerDown}
              >
                <span
                  aria-hidden="true"
                  className="h-1 w-10 rounded-full bg-slate-400/40"
                />
              </div>
            ) : null}

            {title || showClose ? (
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
                <div className="min-w-0">
                  {title ? (
                    <h2
                      id={titleId}
                      className="text-lg font-bold leading-6 text-tg-text"
                    >
                      {title}
                    </h2>
                  ) : null}
                  {description ? (
                    <p
                      id={descriptionId}
                      className="mt-1 text-xs leading-5 text-tg-hint"
                    >
                      {description}
                    </p>
                  ) : null}
                </div>
                {showClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрыть"
                    className="tap-scale -mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tg-secondary-bg/80 text-base text-tg-hint"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ) : null}

            <div
              className={`scroll-area min-h-0 flex-1 px-5 pb-4 ${
                title ? '' : 'pt-5'
              } ${contentClassName}`}
            >
              {children}
            </div>

            {footer ? (
              <div className="shrink-0 border-t border-slate-300/15 px-5 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
