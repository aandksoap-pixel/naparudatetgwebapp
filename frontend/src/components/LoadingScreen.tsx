interface SpinnerProps {
  size?: number;
  className?: string;
}

/** Компактный спиннер для кнопок и inline-загрузок. */
export function Spinner({ size = 18, className = '' }: SpinnerProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

interface LoadingScreenProps {
  message?: string;
  hint?: string;
  fullScreen?: boolean;
}

/** Экран первичной загрузки сессии. */
export function LoadingScreen({
  message = 'Собираем ваше пространство…',
  hint = 'Секунда — и всё будет готово',
  fullScreen = true,
}: LoadingScreenProps): JSX.Element {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center px-6 py-12 ${
        fullScreen ? 'min-h-[var(--app-height)]' : 'min-h-[240px]'
      }`}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 animate-ping rounded-[28px] bg-rose-400/20"
        />
        <div className="brand-gradient flex h-20 w-20 items-center justify-center rounded-[28px] text-4xl shadow-glow">
          🫶
        </div>
      </div>
      <p className="mt-6 text-base font-semibold text-tg-text">{message}</p>
      <p className="mt-1.5 text-center text-xs leading-5 text-tg-hint">{hint}</p>
      <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
