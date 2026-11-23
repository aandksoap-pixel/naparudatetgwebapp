import WebApp from '@twa-dev/sdk';

type ThemeParams = typeof WebApp.themeParams;
type ThemeKey = keyof ThemeParams;
type HexColor = `#${string}`;

const LIGHT_THEME = {
  bg_color: '#ffffff',
  secondary_bg_color: '#f1f1f1',
  text_color: '#000000',
  hint_color: '#8e8e93',
  link_color: '#2481cc',
  button_color: '#2481cc',
  button_text_color: '#ffffff',
  header_bg_color: '#ffffff',
  accent_text_color: '#2481cc',
  section_bg_color: '#ffffff',
  section_header_text_color: '#6d6d72',
  subtitle_text_color: '#8e8e93',
  destructive_text_color: '#ff3b30',
  section_separator_color: '#e5e5ea',
  bottom_bar_bg_color: '#ffffff',
} as const satisfies Record<ThemeKey, HexColor>;

const DARK_THEME = {
  bg_color: '#17212b',
  secondary_bg_color: '#232e3c',
  text_color: '#ffffff',
  hint_color: '#7d8b99',
  link_color: '#6ab2f2',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
  header_bg_color: '#17212b',
  accent_text_color: '#6ab2f2',
  section_bg_color: '#17212b',
  section_header_text_color: '#7d8b99',
  subtitle_text_color: '#7d8b99',
  destructive_text_color: '#ff4d4d',
  section_separator_color: '#101921',
  bottom_bar_bg_color: '#17212b',
} as const satisfies Record<ThemeKey, HexColor>;

const THEME_VARIABLES: ReadonlyArray<
  readonly [ThemeKey, string, string?]
> = [
  ['bg_color', '--tg-bg', '--tg-bg-rgb'],
  ['secondary_bg_color', '--tg-secondary-bg', '--tg-secondary-bg-rgb'],
  ['text_color', '--tg-text', '--tg-text-rgb'],
  ['hint_color', '--tg-hint', '--tg-hint-rgb'],
  ['link_color', '--tg-link', '--tg-link-rgb'],
  ['button_color', '--tg-button', '--tg-button-rgb'],
  ['button_text_color', '--tg-button-text', '--tg-button-text-rgb'],
  ['destructive_text_color', '--tg-destructive', '--tg-destructive-rgb'],
  ['section_bg_color', '--tg-section-bg', '--tg-section-bg-rgb'],
  ['header_bg_color', '--tg-header-bg', '--tg-header-bg-rgb'],
  [
    'section_header_text_color',
    '--tg-section-header',
    '--tg-section-header-rgb',
  ],
  ['subtitle_text_color', '--tg-subtitle', '--tg-subtitle-rgb'],
  ['accent_text_color', '--tg-accent'],
  ['section_separator_color', '--tg-separator'],
  ['bottom_bar_bg_color', '--tg-bottom-bar'],
];

/** Преобразует #rgb/#rrggbb в триплет «r g b» для Tailwind-модификаторов. */
function hexToRgbTriplet(color: string): string | null {
  const raw = color.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(raw)) return null;
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : raw;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if (![red, green, blue].every((value) => Number.isFinite(value))) {
    return null;
  }
  return `${red} ${green} ${blue}`;
}

export type TelegramTheme = 'light' | 'dark';
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

export interface TelegramUserInfo {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
}

let listenersAttached = false;

/**
 * SDK сам создаёт window.Telegram.WebApp (встроенный telegram-web-apps),
 * поэтому объект доступен и вне Telegram; проверяем, что он реально есть.
 */
export function getWebApp(): typeof WebApp | null {
  if (typeof window === 'undefined') return null;
  const telegramWindow = window as unknown as {
    Telegram?: { WebApp?: unknown };
  };
  const app = telegramWindow.Telegram?.WebApp;
  return app ? WebApp : null;
}

export function isTelegramEnvironment(): boolean {
  return Boolean(getWebApp());
}

export function getInitData(): string {
  try {
    return getWebApp()?.initData ?? '';
  } catch {
    return '';
  }
}

export function getStartParam(): string | null {
  try {
    const value = getWebApp()?.initDataUnsafe?.start_param;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function getTelegramUser(): TelegramUserInfo | null {
  try {
    const user = getWebApp()?.initDataUnsafe?.user;
    if (!user) return null;
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name ?? null,
      username: user.username ?? null,
      photoUrl: user.photo_url ?? null,
      languageCode: user.language_code ?? null,
    };
  } catch {
    return null;
  }
}

/** Применяет тему Telegram к CSS-переменным и html-классам. */
export function applyTelegramTheme(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const webApp = getWebApp();
  const scheme: TelegramTheme =
    webApp?.colorScheme === 'dark' ? 'dark' : 'light';
  const params = (webApp?.themeParams ?? {}) as Partial<ThemeParams>;
  const palette = scheme === 'dark' ? DARK_THEME : LIGHT_THEME;

  for (const [key, cssVariable, rgbVariable] of THEME_VARIABLES) {
    const value = params[key] ?? palette[key];
    if (!value) continue;
    root.style.setProperty(cssVariable, value);
    if (rgbVariable) {
      const triplet = hexToRgbTriplet(value);
      if (triplet) root.style.setProperty(rgbVariable, triplet);
    }
  }

  root.classList.toggle('dark', scheme === 'dark');
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

  const background = params.bg_color ?? palette.bg_color;
  const header =
    params.header_bg_color ??
    params.secondary_bg_color ??
    palette.header_bg_color;
  const bottomBar =
    params.bottom_bar_bg_color ?? palette.bottom_bar_bg_color;

  try {
    webApp?.setBackgroundColor(background);
  } catch {
    /* вне Telegram метод может быть недоступен */
  }
  try {
    webApp?.setHeaderColor(header);
  } catch {
    /* вне Telegram метод может быть недоступен */
  }
  try {
    if (typeof webApp?.setBottomBarColor === 'function') {
      webApp.setBottomBarColor(bottomBar);
    }
  } catch {
    /* метод появился в новых версиях Telegram */
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', background);
}

/** Обновляет --app-height и safe-area переменные под текущий viewport. */
export function updateViewport(): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const webApp = getWebApp();
  const height =
    webApp?.viewportStableHeight ||
    webApp?.viewportHeight ||
    window.innerHeight;
  if (height > 0) {
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
  }

  const safeTop = webApp?.safeAreaInset?.top ?? 0;
  const safeBottom = webApp?.safeAreaInset?.bottom ?? 0;
  root.style.setProperty('--tg-safe-top', `${Math.max(0, safeTop)}px`);
  root.style.setProperty('--tg-safe-bottom', `${Math.max(0, safeBottom)}px`);
}

/**
 * Стартовая инициализация Mini App. Идемпотентна: повторный вызов
 * (например, при HMR) не навешивает слушатели дважды.
 */
export function initTelegram(): void {
  if (typeof window === 'undefined') return;

  const webApp = getWebApp();
  try {
    webApp?.ready();
  } catch {
    /* noop */
  }
  try {
    webApp?.expand();
  } catch {
    /* noop */
  }

  applyTelegramTheme();
  updateViewport();

  if (listenersAttached) return;
  listenersAttached = true;

  try {
    webApp?.onEvent('themeChanged', () => applyTelegramTheme());
    webApp?.onEvent('viewportChanged', () => updateViewport());
    webApp?.onEvent('safeAreaChanged', () => updateViewport());
    webApp?.onEvent('contentSafeAreaChanged', () => updateViewport());
  } catch {
    /* noop */
  }

  window.addEventListener('resize', updateViewport, { passive: true });
  window.addEventListener('orientationchange', updateViewport);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateViewport();
  });
}

export function openTelegramLink(url: string): void {
  const webApp = getWebApp();
  try {
    if (webApp && typeof webApp.openTelegramLink === 'function') {
      webApp.openTelegramLink(url);
      return;
    }
  } catch {
    /* fallback ниже */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openExternalLink(url: string): void {
  const webApp = getWebApp();
  try {
    if (webApp && typeof webApp.openLink === 'function') {
      webApp.openLink(url);
      return;
    }
  } catch {
    /* fallback ниже */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Открывает счёт Telegram Stars. Вне Telegram вернёт 'failed',
 * чтобы интерфейс показал ошибку, а не завис.
 */
export function openInvoice(
  url: string,
  onClosed: (status: InvoiceStatus) => void,
): void {
  const webApp = getWebApp();
  if (!webApp || typeof webApp.openInvoice !== 'function') {
    onClosed('failed');
    return;
  }
  try {
    webApp.openInvoice(url, (status) => onClosed(status));
  } catch {
    onClosed('failed');
  }
}

export function closeTelegramApp(): void {
  try {
    getWebApp()?.close();
  } catch {
    /* noop */
  }
}

/**
 * Копирование текста. В Telegram WebView clipboard API может быть
 * недоступен — используем классический fallback через textarea.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем fallback */
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null;
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    return copied;
  } catch {
    return false;
  }
}
