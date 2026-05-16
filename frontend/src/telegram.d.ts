interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    start_param?: string;
  };
  switchInlineQuery?: (query: string, chooserTypes?: string[]) => void;
  close?: () => void;
  // Bot API 7.7+ — suppresses Telegram's swipe-to-minimize gesture (iOS/Android)
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
