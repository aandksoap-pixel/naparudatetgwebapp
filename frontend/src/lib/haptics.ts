import { getWebApp } from './telegram';

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type NotificationType = 'error' | 'success' | 'warning';

function withHaptics(action: (app: NonNullable<ReturnType<typeof getWebApp>>) => void): void {
  const webApp = getWebApp();
  if (!webApp) return;
  try {
    action(webApp);
  } catch {
    /* HapticFeedback может отсутствовать на старых клиентах */
  }
}

/** Короткий тактильный отклик — свайпы, крупные кнопки. */
export function hapticImpact(style: ImpactStyle = 'light'): void {
  withHaptics((app) => {
    app.HapticFeedback?.impactOccurred(style);
  });
}

/** Отклик выбора — табы, сегменты, переключатели. */
export function hapticSelection(): void {
  withHaptics((app) => {
    app.HapticFeedback?.selectionChanged();
  });
}

/** Системное уведомление — успех/ошибка/предупреждение. */
export function hapticNotification(type: NotificationType): void {
  withHaptics((app) => {
    app.HapticFeedback?.notificationOccurred(type);
  });
}

export const hapticSuccess = (): void => hapticNotification('success');
export const hapticError = (): void => hapticNotification('error');
export const hapticWarning = (): void => hapticNotification('warning');
