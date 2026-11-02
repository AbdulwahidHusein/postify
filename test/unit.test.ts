import { describe, expect, it } from "vitest";
import { GrammyError } from "grammy";
import { formatMoney, toMajorString, toMinor } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import {
  captionSaysSold,
  hasPriceLike,
  looksLikeListing,
  parsePriceReply,
  telegramGroupKey,
} from "@/server/domain/ingest-rules";
import { chooseMode, desiredHash, renderKeyboard, startParam } from "@/server/domain/buttons";
import { classifyTelegramError, miniAppLink, webLink } from "@/server/services/telegram";
import { canTransition } from "@/server/domain/orders";
import { can } from "@/server/auth/authorize";
import { uuidv7, shortCode, slugify } from "@/server/ids";

function gErr(code: number, description: string, retry_after?: number) {
  return new GrammyError(
    "Call failed",
    { ok: false, error_code: code, description, parameters: retry_after ? { retry_after } : {} },
    "editMessageReplyMarkup",
    {},
  );
}

describe("money", () => {
  it("parses majors to minor units exactly", () => {
    expect(toMinor("4,500")).toBe(450000n);
    expect(toMinor("4500.5")).toBe(450050n);
    expect(toMinor(0.1)).toBe(10n);
    expect(toMinor("12.999")).toBe(1299n);
    expect(toMinor("abc")).toBeNull();
    expect(toMinor("")).toBeNull();
  });
  it("formats", () => {
    expect(formatMoney(450000n, "ETB")).toBe("ETB 4,500");
    expect(formatMoney("123456789", "ETB")).toBe("ETB 1,234,567.89");
    expect(formatMoney(null)).toBeNull();
    expect(toMajorString(450050n)).toBe("4500.50");
  });
});

describe("phone", () => {
  it.each([
    ["0911234567", "+251911234567"],
    ["0911 234 567", "+251911234567"],
    ["+251 911 234 567", "+251911234567"],
    ["251911234567", "+251911234567"],
    ["911234567", "+251911234567"],
    ["0711234567", "+251711234567"],
    ["+14155550123", "+14155550123"],
  ])("normalizes %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["12345", "0811234567", "hello", "+251811234567"])("rejects %s", (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );
});

describe("ingest rules", () => {
  it("detects prices but not phone numbers", () => {
    expect(hasPriceLike("iPhone 13 45,000 birr")).toBe(true);
    expect(hasPriceLike("ዋጋ 4500")).toBe(true);
    expect(hasPriceLike("Price: 3200")).toBe(true);
    expect(hasPriceLike("ETB 999")).toBe(true);
    expect(hasPriceLike("Call 0911234567 for details")).toBe(false);
    expect(hasPriceLike("Good morning everyone!")).toBe(false);
  });
  it("prefilter needs a photo or a price", () => {
    expect(looksLikeListing({ caption: "Happy holiday", photoCount: 0 })).toBe(false);
    expect(looksLikeListing({ caption: "", photoCount: 1 })).toBe(true);
    expect(looksLikeListing({ caption: "Shoes 2500 br", photoCount: 0 })).toBe(true);
  });
  it("parses price replies", () => {
    expect(parsePriceReply("4500")).toBe(4500);
    expect(parsePriceReply("4,500 birr")).toBe(4500);
    expect(parsePriceReply("ETB 4500.50")).toBe(4500.5);
    expect(parsePriceReply("call me")).toBeNull();
    expect(parsePriceReply("0")).toBeNull();
  });
  it("sold markers", () => {
    expect(captionSaysSold("iPhone 13\nSOLD")).toBe(true);
    expect(captionSaysSold("ተሽጧል")).toBe(true);
    expect(captionSaysSold("#sold out")).toBe(true);
    expect(captionSaysSold("Soldering iron 500 birr")).toBe(false);
  });
  it("groups albums by media_group_id", () => {
    expect(telegramGroupKey({ chatId: -100n, messageId: 5, mediaGroupId: "abc" })).toBe("-100:g:abc");
    expect(telegramGroupKey({ chatId: -100n, messageId: 5 })).toBe("-100:m:5");
  });
});

describe("post buttons", () => {
  const product = {
    code: "PRODCODE01",
    slug: "iphone-13",
    title: "iPhone 13",
    status: "published" as const,
    priceMinor: 4500000n,
    currency: "ETB",
    available: true,
  };
  it("renders Order with price, Ask and Shop as plain https web links", () => {
    const kb = renderKeyboard({ product, sourceCode: "SRC1", shopHandle: "abel", lang: "en" })!;
    expect(kb[0][0].text).toBe("🛒 Order · ETB 45,000");
    expect(kb[0][0].url).toBe(webLink("/go/p_PRODCODE01_SRC1"));
    expect(kb[0][0].url).toMatch(/^https:\/\/.+\/go\/p_PRODCODE01_SRC1$/);
    expect(kb[0][0].url).not.toContain("startapp=");
    expect(kb[1].map((b) => b.text)).toEqual(["💬 Ask seller", "🏪 Shop"]);
    expect(kb[1][1].url).toBe(webLink("/go/s_abel"));
  });
  it("Amharic labels", () => {
    const kb = renderKeyboard({ product, sourceCode: "SRC1", shopHandle: "abel", lang: "am" })!;
    expect(kb[0][0].text.startsWith("🛒 ይዘዙ")).toBe(true);
  });
  it("no price → Ask price; sold → Sold; draft → no buttons", () => {
    expect(
      renderKeyboard({ product: { ...product, priceMinor: null }, sourceCode: "S", shopHandle: "a", lang: "en" })![0][0].text,
    ).toBe("💬 Ask price");
    expect(
      renderKeyboard({ product: { ...product, status: "sold" }, sourceCode: "S", shopHandle: "a", lang: "en" })![0][0].text,
    ).toBe("Sold · see similar");
    expect(
      renderKeyboard({ product: { ...product, available: false }, sourceCode: "S", shopHandle: "a", lang: "en" })![0][0].text,
    ).toBe("Sold · see similar");
    expect(renderKeyboard({ product: { ...product, status: "draft" }, sourceCode: "S", shopHandle: "a", lang: "en" })).toBeNull();
  });
  it("start params stay within Telegram's allowed alphabet", () => {
    for (const p of [startParam.order("Ab9Zx01234", "Qw12Er34"), startParam.ask("A", "B"), startParam.shop("my-shop-1")]) {
      expect(p).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
    expect(miniAppLink("bad param!", "/x")).toBe(webLink("/x"));
    expect(webLink("/go/s_abel")).toMatch(/\/go\/s_abel$/);
    expect(miniAppLink("p_PROD_SRC1", "/go/p_PROD_SRC1")).toContain("startapp=");
  });
  it("chooses the decision-ladder mode", () => {
    const channel = { chatType: "channel", canEditMessages: true };
    const base = { buttonMode: "none" as const, mediaGroupId: null, hadForeignMarkup: false };
    expect(chooseMode(base, channel)).toBe("inline");
    expect(chooseMode({ ...base, mediaGroupId: "g1" }, channel)).toBe("reply_card");
    expect(chooseMode({ ...base, hadForeignMarkup: true }, channel)).toBe("reply_card");
    expect(chooseMode(base, { chatType: "supergroup", canEditMessages: true })).toBe("reply_card");
    expect(chooseMode(base, { chatType: "channel", canEditMessages: false })).toBe("reply_card");
    expect(chooseMode({ ...base, buttonMode: "bot_post" }, channel)).toBe("bot_post");
    expect(chooseMode({ ...base, buttonMode: "reply_card" }, channel)).toBe("reply_card");
  });
  it("hash changes with content and mode", () => {
    const kb = renderKeyboard({ product, sourceCode: "S", shopHandle: "a", lang: "en" });
    expect(desiredHash("inline", kb, "t")).toBe(desiredHash("inline", kb, "different text ignored inline"));
    expect(desiredHash("inline", kb, "t")).not.toBe(desiredHash("reply_card", kb, "t"));
  });
});

describe("telegram error classification", () => {
  it.each([
    [gErr(400, "Bad Request: message is not modified: specified new message content..."), "not_modified"],
    [gErr(400, "Bad Request: message to edit not found"), "message_not_found"],
    [gErr(400, "Bad Request: message can't be edited"), "cant_edit"],
    [gErr(403, "Forbidden: bot was blocked by the user"), "blocked"],
    [gErr(400, "Bad Request: not enough rights to edit messages"), "no_rights"],
    [gErr(400, "Bad Request: chat not found"), "chat_not_found"],
    [gErr(502, "Bad Gateway"), "transient"],
  ])("%#", (err, kind) => expect(classifyTelegramError(err).kind).toBe(kind));
  it("rate limits carry retry_after", () => {
    const c = classifyTelegramError(gErr(429, "Too Many Requests: retry after 7", 7));
    expect(c).toMatchObject({ kind: "rate_limited", retryAfter: 7 });
  });
});

describe("order state machine", () => {
  it("allows only valid transitions", () => {
    expect(canTransition("placed", "confirm", "pending")).toBe(true);
    expect(canTransition("placed", "ship", "pending")).toBe(false);
    expect(canTransition("delivered", "cancel", "pending")).toBe(false);
    expect(canTransition("cancelled", "mark_paid", "pending")).toBe(false);
    expect(canTransition("delivered", "mark_paid", "pending")).toBe(true);
    expect(canTransition("delivered", "mark_paid", "paid")).toBe(false);
  });
});

describe("roles", () => {
  it("staff cannot change settings or staff", () => {
    expect(can("staff", "orders.manage")).toBe(true);
    expect(can("staff", "shop.settings")).toBe(false);
    expect(can("admin", "shop.staff")).toBe(false);
    expect(can("owner", "shop.staff")).toBe(true);
  });
});

describe("ids", () => {
  it("uuidv7 is time ordered", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a < b).toBe(true);
    expect(a[14]).toBe("7");
  });
  it("short codes and slugs", () => {
    expect(shortCode(10)).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(slugify("Abel's Shoes & Bags!")).toBe("abel-s-shoes-bags");
    expect(slugify("ጫማ")).toBe("");
  });
});

import { parseListingCaption } from "@/server/services/llm/parse-listing";
describe("rule-based listing parser", () => {
  it("keeps model numbers in titles and finds the real price", () => {
    const r = parseListingCaption("iPhone 13 Pro 128GB\nPrice 45,000 birr\nCall 0911234567", { hasMedia: true });
    expect(r.title).toBe("iPhone 13 Pro 128GB");
    expect(r.price).toBe(45000);
    expect(r.currency).toBe("ETB");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it("strips the price from a one-line caption", () => {
    const r = parseListingCaption("Shoes size 42 - 2,500 ብር", { hasMedia: true });
    expect(r.title).toBe("Shoes size 42");
    expect(r.price).toBe(2500);
  });
  it("bare numbers give a low-confidence price", () => {
    const r = parseListingCaption("Office chair\n3500", { hasMedia: true });
    expect(r.price).toBe(3500);
    expect(r.confidence).toBeLessThan(0.8);
  });
  it("usd and negotiable", () => {
    const r = parseListingCaption("Laptop $450 negotiable", { hasMedia: true });
    expect(r).toMatchObject({ price: 450, currency: "USD", isNegotiable: true, title: "Laptop negotiable" });
  });
  it("no price, no media → not a product", () => {
    expect(parseListingCaption("Good morning").isProduct).toBe(false);
  });
});
