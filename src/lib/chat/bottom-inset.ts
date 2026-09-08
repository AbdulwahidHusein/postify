/**
 * Bottom inset for docked chat composer.
 *
 * Telegram: safeAreaInset.bottom + contentSafeAreaInset.bottom (SUM).
 * Browser: env(safe-area-inset-bottom).
 *
 * NEVER derive inset from viewport height math — parsing CSS lengths like
 * "100dvh" as numbers created multi-hundred-px padding and floated the
 * composer mid-screen.
 */

type TgSafeInsets = {
  bottom?: number;
};

type TgWebApp = {
  safeAreaInset?: TgSafeInsets;
  contentSafeAreaInset?: TgSafeInsets;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  requestSafeArea?: () => void;
  requestContentSafeArea?: () => void;
};

const COMFORT_PX = 8;
/** Soft floor when touch phones report 0 (gesture / home bar). */
const TOUCH_FLOOR_PX = 34;
/** Hard cap — insets are never half the screen. */
const MAX_INSET_PX = 72;

function asPx(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Only accept px-like CSS values ("34px", "34"). Reject "100dvh" etc. */
function asCssPx(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  if (/^\d+(\.\d+)?(px)?$/i.test(t)) return asPx(parseFloat(t));
  return 0;
}

function isTouchPhone(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  return (coarse || navigator.maxTouchPoints > 0) && narrow;
}

function readCssEnvBottom(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const value = asPx(parseFloat(getComputedStyle(probe).paddingBottom));
  probe.remove();
  return value;
}

function readTelegramWebAppBottom(): number {
  try {
    const tg = window.Telegram?.WebApp as TgWebApp | undefined;
    if (!tg) return 0;
    return (
      asPx(tg.safeAreaInset?.bottom) + asPx(tg.contentSafeAreaInset?.bottom)
    );
  } catch {
    return 0;
  }
}

function readBoundCssVarsBottom(): number {
  if (typeof document === "undefined") return 0;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => asCssPx(styles.getPropertyValue(name));

  const sdkSum =
    read("--tg-viewport-safe-area-inset-bottom") +
    read("--tg-viewport-content-safe-area-inset-bottom");
  const tgSum =
    read("--tg-safe-area-inset-bottom") +
    read("--tg-content-safe-area-inset-bottom");
  return Math.max(sdkSum, tgSum);
}

export function measureChatBottomInset(): number {
  const reported = Math.max(
    readCssEnvBottom(),
    readTelegramWebAppBottom(),
    readBoundCssVarsBottom(),
  );
  const floor = isTouchPhone() ? TOUCH_FLOOR_PX : 0;
  return Math.min(MAX_INSET_PX, Math.max(reported, floor) + COMFORT_PX);
}

export function subscribeChatBottomInset(
  onChange: (px: number) => void,
): () => void {
  const emit = () => onChange(measureChatBottomInset());

  emit();

  const tg = window.Telegram?.WebApp as TgWebApp | undefined;
  try {
    tg?.requestSafeArea?.();
    tg?.requestContentSafeArea?.();
  } catch {
    /* ignore */
  }

  window.addEventListener("resize", emit);
  window.visualViewport?.addEventListener("resize", emit);

  const events = [
    "safeAreaChanged",
    "contentSafeAreaChanged",
    "viewportChanged",
    "fullscreenChanged",
  ] as const;
  for (const event of events) {
    try {
      tg?.onEvent?.(event, emit);
    } catch {
      /* ignore */
    }
  }

  const t1 = window.setTimeout(emit, 50);
  const t2 = window.setTimeout(emit, 300);

  return () => {
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    window.removeEventListener("resize", emit);
    window.visualViewport?.removeEventListener("resize", emit);
    for (const event of events) {
      try {
        tg?.offEvent?.(event, emit);
      } catch {
        /* ignore */
      }
    }
  };
}
