export type TelegramUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
};

export type TelegramRuntimeState = {
  /** True when running inside Telegram Mini App after successful init. */
  isTma: boolean;
  /** SDK finished attempting init (success or browser fallback). */
  ready: boolean;
  user: TelegramUser | null;
  startParam: string | null;
  /** Raw initData string for server-side auth. */
  rawInitData: string | null;
  error: string | null;
};
