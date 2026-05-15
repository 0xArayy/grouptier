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
  };
  switchInlineQuery?: (query: string, chooserTypes?: string[]) => void;
  close?: () => void;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
