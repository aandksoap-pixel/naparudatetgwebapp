import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Глобальный предохранитель: вместо белого экрана показываем
 * понятный fallback с возможностью перезагрузить приложение.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : 'Неизвестная ошибка приложения',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[App] Unhandled error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[var(--app-height)] w-full items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm rounded-4xl border border-rose-300/30 bg-tg-bg/90 p-6 text-center shadow-card backdrop-blur-xl">
          <div className="brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-glow">
            🫂
          </div>
          <h1 className="mt-5 text-xl font-bold text-tg-text">
            Что-то пошло не так
          </h1>
          <p className="mt-2 text-sm leading-6 text-tg-hint">
            Приложение столкнулось с неожиданной ошибкой. Попробуйте
            перезагрузить — ваши данные и пара останутся на месте.
          </p>
          {this.state.message ? (
            <p className="mt-3 break-words rounded-xl bg-tg-secondary-bg/70 px-3 py-2 text-[11px] leading-4 text-tg-hint">
              {this.state.message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="btn btn-primary mt-5 w-full"
          >
            Перезагрузить приложение
          </button>
          <p className="mt-3 text-[11px] leading-4 text-tg-hint">
            Если ошибка повторяется — закройте и снова откройте мини-приложение
            в Telegram.
          </p>
        </div>
      </div>
    );
  }
}
