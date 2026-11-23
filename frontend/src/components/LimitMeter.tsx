interface LimitMeterProps {
  used: number;
  limit: number | null;
  isUnlimited: boolean;
  onUpgrade?: () => void;
  className?: string;
}

/**
 * Индикатор дневного лимита. Для PRO показывает «Безлимит PRO»,
 * для FREE — прогресс и кнопку апгрейда при исчерпании.
 */
export function LimitMeter({
  used,
  limit,
  isUnlimited,
  onUpgrade,
  className = '',
}: LimitMeterProps): JSX.Element {
  if (isUnlimited || limit === null) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2.5 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-base">
            ✨
          </span>
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-200">
              Безлимит PRO
            </p>
            <p className="text-[10px] leading-4 text-tg-hint">
              Свайпайте без ограничений
            </p>
          </div>
        </div>
        <span className="brand-gradient rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
          PRO
        </span>
      </div>
    );
  }

  const safeLimit = Math.max(0, limit);
  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, safeLimit - safeUsed);
  const exhausted = remaining === 0;
  const percent = safeLimit === 0 ? 100 : Math.min(100, Math.round((safeUsed / safeLimit) * 100));

  return (
    <div className={`rounded-2xl border border-slate-300/20 bg-tg-secondary-bg/50 px-3.5 py-2.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-tg-text">
          {exhausted ? (
            <span className="text-rose-500 dark:text-rose-400">
              Лимит на сегодня исчерпан
            </span>
          ) : (
            <>
              Осталось{' '}
              <span className="text-tg-text">
                {remaining} из {safeLimit}
              </span>
            </>
          )}
        </p>
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-tg-hint">
          {exhausted ? '0' : `${remaining}/${safeLimit}`}
        </span>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-400/20"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeLimit}
        aria-valuenow={Math.min(safeUsed, safeLimit)}
        aria-label="Использование дневного лимита"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            exhausted
              ? 'bg-rose-500'
              : 'bg-gradient-to-r from-rose-400 to-orange-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {exhausted && onUpgrade ? (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-tg-link"
        >
          Открыть PRO на двоих <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}
