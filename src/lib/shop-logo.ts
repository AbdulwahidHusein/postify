import "server-only";

import { requireBotToken } from "@/lib/env.server";
import {
  deleteLocalProductImage,
  saveLocalShopLogo,
} from "@/lib/storage";
import {
  normalizeShopSettings,
  normalizeTelegramChannel,
  updateShop,
} from "@/lib/shops";
import type { Shop } from "@/db/schema";

async function downloadTelegramFile(fileId: string): Promise<{
  buffer: Buffer;
  mime: string;
} | null> {
  const token = requireBotToken();
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = (await metaRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!meta.ok || !meta.result?.file_path) return null;

  const fileUrl = `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) return null;

  const mime = fileRes.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mime };
}

/** Fetch channel profile photo via getChat and store as shop logo when allowed. */
export async function syncShopLogoFromTelegramChat(input: {
  shop: Shop;
  telegramChatId: bigint;
  channelUsername?: string | null;
  force?: boolean;
}): Promise<Shop> {
  const settings = normalizeShopSettings(input.shop.settings);
  if (!input.force && settings.logoSource === "upload" && settings.logoUrl) {
    return input.shop;
  }

  const token = requireBotToken();
  const chatRes = await fetch(
    `https://api.telegram.org/bot${token}/getChat?chat_id=${input.telegramChatId.toString()}`,
  );
  const chatData = (await chatRes.json()) as {
    ok: boolean;
    result?: {
      photo?: { big_file_id?: string; small_file_id?: string };
      username?: string;
      title?: string;
    };
  };

  if (!chatData.ok || !chatData.result) {
    return input.shop;
  }

  const fileId =
    chatData.result.photo?.big_file_id ??
    chatData.result.photo?.small_file_id ??
    null;

  const patch: {
    settings: Partial<ReturnType<typeof normalizeShopSettings>>;
  } = {
    settings: {},
  };

  // Prefer channel @username on storefront if seller hasn't set one.
  const username =
    input.channelUsername ?? chatData.result.username ?? null;
  if (!settings.telegramChannel && username) {
    patch.settings.telegramChannel = normalizeTelegramChannel(`@${username}`);
  }

  if (fileId) {
    const downloaded = await downloadTelegramFile(fileId);
    if (downloaded) {
      const saved = await saveLocalShopLogo(input.shop.id, downloaded);
      if (settings.logoUrl && settings.logoSource === "telegram") {
        await deleteLocalProductImage(settings.logoUrl);
      }
      patch.settings.logoUrl = saved.url;
      patch.settings.logoSource = "telegram";
    }
  }

  if (Object.keys(patch.settings).length === 0) {
    return input.shop;
  }

  return updateShop(input.shop.id, patch);
}
