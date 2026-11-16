import { t } from '../i18n';

// Telegram Mini App support. Inside Telegram the game expands to full height and
// shares through Telegram's own share sheet; elsewhere it uses the Web Share API
// or the clipboard. See docs/DISTRIBUTION.md for bot setup.
interface TelegramWebApp {
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  disableVerticalSwipes?(): void;
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

export const inTelegram = () =>
  typeof location !== 'undefined' && (/tgWebApp/.test(location.hash + location.search) || Boolean(window.Telegram?.WebApp));

/** Loads Telegram's script only when opened as a Mini App. */
export function setupTelegram() {
  if (!/tgWebApp/.test(location.hash + location.search)) return;
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.onload = () => {
    const app = window.Telegram?.WebApp;
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor?.('#0a1319');
    app.setBackgroundColor?.('#0a1319');
    app.disableVerticalSwipes?.();
  };
  document.head.append(script);
}

/** Shares a result card: Telegram share sheet, then the system share sheet, then the clipboard. */
export async function shareText(text: string) {
  const app = window.Telegram?.WebApp;
  const url = text.match(/https?:\/\/\S+/)?.[0] ?? location.href;
  if (app?.openTelegramLink) {
    app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text.replace(url, '').trim())}`);
    return 'telegram';
  }
  try {
    if (navigator.share) { await navigator.share({ text }); return 'share'; }
  } catch { /* Cancelled or blocked; fall through to the clipboard. */ }
  try {
    await navigator.clipboard.writeText(text);
    toastLoop(t('Copied — paste it into a chat.'));
    return 'clipboard';
  } catch {
    window.prompt('Copy:', text);
    return 'prompt';
  }
}

function toastLoop(text: string) {
  const message = document.getElementById('loopMessage');
  if (message) message.textContent = text;
}
