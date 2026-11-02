import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { uuidv7 } from "@/server/ids";

// ── helpers ─────────────────────────────────────────────────────────────────
const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "bigint" });

// ── identity ────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").notNull().default(false),
  photoUrl: text("photo_url"),
  phone: text("phone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const loginTokens = pgTable("login_tokens", {
  id: id(),
  token: text("token").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  redirectPath: text("redirect_path"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ── shops ───────────────────────────────────────────────────────────────────
export type ShopTheme = {
  accent: string;
  font: "sans" | "serif";
  bannerKey?: string | null;
  tagline?: string | null;
  sections: ("hero" | "featured" | "grid" | "about" | "contact")[];
  featuredCollectionId?: string | null;
};

export type ShopSettings = {
  ingestMode: "auto_publish" | "always_draft" | "paused";
  autoPublishMinConfidence: number;
  buttonsOnPosts: boolean;
  buttonLanguage: "en" | "am";
  notifyOrders: boolean;
  notifyMessages: boolean;
  autoArchiveDays: number | null;
  delivery: {
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFeeMinor: string; // bigint as string in JSON
    deliveryNote: string | null;
    pickupAddress: string | null;
  };
  contact: {
    phone: string | null;
    telegramUsername: string | null;
    address: string | null;
  };
  theme: ShopTheme;
  sellCategories: string[];
  /** Storefront design (see src/lib/store-design.ts): published, draft, and when it went live. */
  design?: unknown;
  designDraft?: unknown;
  designPublishedAt?: string | null;
};

export const shopStatusEnum = pgEnum("shop_status", ["active", "hidden"]);

export const shops = pgTable(
  "shops",
  {
    id: id(),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    logoKey: text("logo_key"),
    locale: text("locale").notNull().default("en"),
    currency: text("currency").notNull().default("ETB"),
    status: shopStatusEnum("status").notNull().default("active"),
    settings: jsonb("settings").$type<ShopSettings>().notNull(),
    nextOrderNumber: integer("next_order_number").notNull().default(1001),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("shops_handle_uidx").on(t.handle)],
);

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "staff"]);

export const shopMembers = pgTable(
  "shop_members",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("shop_members_shop_user_uidx").on(t.shopId, t.userId),
    index("shop_members_user_idx").on(t.userId),
  ],
);

/** One-time links that add a staff member through the bot. */
export const shopInvites = pgTable("shop_invites", {
  code: text("code").primaryKey(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const domainKindEnum = pgEnum("domain_kind", ["subdomain", "custom"]);
export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "active",
  "failed",
]);

export const shopDomains = pgTable(
  "shop_domains",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    kind: domainKindEnum("kind").notNull(),
    status: domainStatusEnum("status").notNull().default("pending"),
    cloudflareHostnameId: text("cloudflare_hostname_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("shop_domains_hostname_uidx").on(t.hostname)],
);

// ── Telegram sources ────────────────────────────────────────────────────────
export const channelStatusEnum = pgEnum("channel_status", [
  "connected",
  "disconnected",
]);

/** A linked Telegram channel, group or supergroup that feeds a shop. */
export const channels = pgTable(
  "channels",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    telegramChatId: bigint("telegram_chat_id", { mode: "bigint" })
      .notNull()
      .unique(),
    chatType: text("chat_type").notNull(), // channel | group | supergroup
    title: text("title"),
    username: text("username"),
    status: channelStatusEnum("status").notNull().default("connected"),
    botIsAdmin: boolean("bot_is_admin").notNull().default(false),
    canPostMessages: boolean("can_post_messages").notNull().default(false),
    canEditMessages: boolean("can_edit_messages").notNull().default(false),
    rightsWarnedAt: timestamp("rights_warned_at", { withTimezone: true }),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("channels_shop_idx").on(t.shopId)],
);

export const updateStatusEnum = pgEnum("update_status", [
  "pending",
  "processing",
  "done",
  "skipped",
  "failed",
]);

/** Idempotent webhook inbox for listing posts (update_id is Telegram's). */
export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    updateId: bigint("update_id", { mode: "bigint" }).primaryKey(),
    chatId: bigint("chat_id", { mode: "bigint" }).notNull(),
    messageId: integer("message_id").notNull(),
    mediaGroupId: text("media_group_id"),
    isEdit: boolean("is_edit").notNull().default(false),
    groupKey: text("group_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: updateStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("telegram_updates_group_idx").on(t.groupKey),
    index("telegram_updates_status_idx").on(t.status, t.receivedAt),
  ],
);

// ── catalog ─────────────────────────────────────────────────────────────────
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "published",
  "sold",
  "archived",
]);

export const products = pgTable(
  "products",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    brand: text("brand"),
    model: text("model"),
    condition: text("condition"),
    location: text("location"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    isNegotiable: boolean("is_negotiable").notNull().default(false),
    status: productStatusEnum("status").notNull().default("draft"),
    aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3 }),
    rawCaption: text("raw_caption"),
    needsPrice: boolean("needs_price").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_code_uidx").on(t.code),
    uniqueIndex("products_shop_slug_uidx").on(t.shopId, t.slug),
    index("products_shop_status_updated_idx").on(t.shopId, t.status, t.updatedAt),
    index("products_shop_status_category_idx").on(t.shopId, t.status, t.category),
    index("products_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Default"),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceMinor: money("price_minor"),
    compareAtMinor: money("compare_at_minor"),
    currency: text("currency").notNull().default("ETB"),
    sku: text("sku"),
    trackInventory: boolean("track_inventory").notNull().default(true),
    inventoryQty: integer("inventory_qty").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("product_variants_product_idx").on(t.productId, t.position)],
);

export const imageStatusEnum = pgEnum("image_status", ["pending", "ready", "failed"]);

export type TelegramPhotoSize = { fileId: string; width: number; height: number; fileSize?: number };

export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    telegramFileId: text("telegram_file_id"),
    /** Every size Telegram made of this photo; served as-is instead of resizing. */
    telegramSizes: jsonb("telegram_sizes").$type<TelegramPhotoSize[]>(),
    originalKey: text("original_key"),
    /** Base key; renditions are `${key}-${width}.webp` (or `.jpg` when the key ends in "@jpg"). */
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    dominantColor: text("dominant_color"),
    status: imageStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId, t.position),
    index("product_images_status_idx").on(t.status, t.updatedAt),
  ],
);

export const buttonModeEnum = pgEnum("button_mode", [
  "inline",
  "reply_card",
  "bot_post",
  "none",
]);
export const buttonStatusEnum = pgEnum("button_status", [
  "pending",
  "synced",
  "failed",
  "deleted",
]);

/** Product ↔ Telegram post. One product can be posted in many places. */
export const productSources = pgTable(
  "product_sources",
  {
    id: id(),
    code: text("code").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "bigint" }).notNull(),
    messageId: integer("message_id").notNull(),
    mediaGroupId: text("media_group_id"),
    messageIds: integer("message_ids").array().notNull().default(sql`'{}'::int[]`),
    captionHash: text("caption_hash"),
    extractCount: integer("extract_count").notNull().default(1),
    extractDay: date("extract_day"),
    hadForeignMarkup: boolean("had_foreign_markup").notNull().default(false),
    buttonMode: buttonModeEnum("button_mode").notNull().default("none"),
    cardMessageId: integer("card_message_id"),
    desiredHash: text("desired_hash"),
    appliedHash: text("applied_hash"),
    buttonStatus: buttonStatusEnum("button_status").notNull().default("pending"),
    lastError: text("last_error"),
    syncRequestedAt: timestamp("sync_requested_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_sources_code_uidx").on(t.code),
    uniqueIndex("product_sources_chat_msg_uidx").on(t.chatId, t.messageId),
    uniqueIndex("product_sources_chat_album_uidx")
      .on(t.chatId, t.mediaGroupId)
      .where(sql`${t.mediaGroupId} is not null`),
    index("product_sources_product_idx").on(t.productId),
    index("product_sources_sync_idx").on(t.buttonStatus, t.syncRequestedAt),
  ],
);

export const collections = pgTable(
  "collections",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("collections_shop_handle_uidx").on(t.shopId, t.handle)],
);

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.productId] })],
);

// ── customers & commerce ────────────────────────────────────────────────────
export const customers = pgTable(
  "customers",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    notes: text("notes"),
    orderCount: integer("order_count").notNull().default(0),
    cancelCount: integer("cancel_count").notNull().default(0),
    totalSpentMinor: money("total_spent_minor").notNull().default(sql`0`),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    blocked: boolean("blocked").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_shop_phone_uidx").on(t.shopId, t.phone),
    index("customers_shop_last_order_idx").on(t.shopId, t.lastOrderAt),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    ownerKey: text("owner_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("carts_shop_owner_uidx").on(t.shopId, t.ownerKey)],
);

export const cartLines = pgTable(
  "cart_lines",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    sourceCode: text("source_code"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.variantId] })],
);

export const orderStatusEnum = pgEnum("order_status", [
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "voided",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["on_delivery", "online"]);
export const fulfillmentEnum = pgEnum("fulfillment", ["delivery", "pickup"]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    accessToken: text("access_token").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    buyerUserId: uuid("buyer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: orderStatusEnum("status").notNull().default("placed"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    fulfillment: fulfillmentEnum("fulfillment").notNull(),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    address: text("address"),
    notes: text("notes"),
    subtotalMinor: money("subtotal_minor").notNull(),
    deliveryFeeMinor: money("delivery_fee_minor").notNull().default(sql`0`),
    totalMinor: money("total_minor").notNull(),
    currency: text("currency").notNull().default("ETB"),
    sourceCode: text("source_code"),
    conversationId: uuid("conversation_id"),
    cancelReason: text("cancel_reason"),
    remindersSent: integer("reminders_sent").notNull().default(0),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_shop_number_uidx").on(t.shopId, t.number),
    index("orders_shop_created_idx").on(t.shopId, t.createdAt),
    index("orders_shop_status_idx").on(t.shopId, t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_buyer_idx").on(t.buyerUserId),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    variantTitle: text("variant_title"),
    imageKey: text("image_key"),
    unitPriceMinor: money("unit_price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    restocked: boolean("restocked").notNull().default(false),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_uidx")
      .on(t.provider, t.providerRef)
      .where(sql`${t.providerRef} is not null`),
    index("payments_order_idx").on(t.orderId),
  ],
);

// ── chat ────────────────────────────────────────────────────────────────────
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "closed"]);
export const senderRoleEnum = pgEnum("sender_role", ["buyer", "seller", "system"]);
export const messageKindEnum = pgEnum("message_kind", ["text", "image"]);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    sellerUnread: integer("seller_unread").notNull().default(0),
    buyerUnread: integer("buyer_unread").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversations_shop_product_buyer_uidx").on(
      t.shopId,
      t.productId,
      t.buyerUserId,
    ),
    index("conversations_shop_last_idx").on(t.shopId, t.lastMessageAt),
    index("conversations_buyer_last_idx").on(t.buyerUserId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderRole: senderRoleEnum("sender_role").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: messageKindEnum("kind").notNull().default("text"),
    body: text("body").notNull().default(""),
    imageKey: text("image_key"),
    clientId: text("client_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_sender_created_idx").on(t.senderUserId, t.createdAt),
    uniqueIndex("messages_conversation_client_uidx")
      .on(t.conversationId, t.clientId)
      .where(sql`${t.clientId} is not null`),
  ],
);

/** Telegram message ↔ Goods record, for reply-to routing. */
export const telegramDeliveries = pgTable(
  "telegram_deliveries",
  {
    id: id(),
    telegramChatId: bigint("telegram_chat_id", { mode: "bigint" }).notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    kind: text("kind").notNull(), // chat_message | listing_receipt | order
    refId: uuid("ref_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("telegram_deliveries_msg_uidx").on(
      t.telegramChatId,
      t.telegramMessageId,
    ),
  ],
);

/** Pending bot conversation state per Telegram user (reply target, price prompt). */
export const botContexts = pgTable("bot_contexts", {
  telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).primaryKey(),
  kind: text("kind").notNull(), // chat_reply | price
  refId: uuid("ref_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: updatedAt(),
});

/** Idempotency ledger for outbound notifications. */
export const notificationLog = pgTable("notification_log", {
  key: text("key").primaryKey(),
  telegramMessageId: integer("telegram_message_id"),
  createdAt: createdAt(),
});

// ── analytics & guardrails ──────────────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    productId: uuid("product_id"),
    orderId: uuid("order_id"),
    sourceCode: text("source_code"),
    actorUserId: uuid("actor_user_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_shop_created_idx").on(t.shopId, t.createdAt),
    index("events_shop_type_created_idx").on(t.shopId, t.type, t.createdAt),
  ],
);

export const shopDailyStats = pgTable(
  "shop_daily_stats",
  {
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
    inquiries: integer("inquiries").notNull().default(0),
    orders: integer("orders").notNull().default(0),
    revenueMinor: money("revenue_minor").notNull().default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.day] })],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    day: date("day").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "bigint" }).notNull().default(sql`0`),
    outcome: text("outcome").notNull(), // ok | error | cached | blocked_quota | blocked_budget
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_usage_day_idx").on(t.day),
    index("ai_usage_shop_day_idx").on(t.shopId, t.day),
  ],
);

export const aiCache = pgTable("ai_cache", {
  key: text("key").primaryKey(), // sha256(shopId + caption)
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

// ── background jobs (TASKS_MODE=db) ───────────────────────────────────────────
/**
 * Durable job queue in Postgres, used on serverless hosts (Vercel). Rows are
 * claimed with FOR UPDATE SKIP LOCKED, retried with backoff, and kept for a
 * day after success so `name` keeps de-duplicating (like Cloud Tasks).
 */
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed"]);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    queue: text("queue").notNull(),
    /** Dedup key: unique per queue. */
    name: text("name"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("jobs_queue_name_uidx").on(t.queue, t.name),
    index("jobs_due_idx").on(t.status, t.runAt),
  ],
);

export type JobRow = typeof jobs.$inferSelect;

// ── relations ───────────────────────────────────────────────────────────────
export const shopsRelations = relations(shops, ({ many }) => ({
  members: many(shopMembers),
  channels: many(channels),
  products: many(products),
  domains: many(shopDomains),
}));

export const shopMembersRelations = relations(shopMembers, ({ one }) => ({
  shop: one(shops, { fields: [shopMembers.shopId], references: [shops.id] }),
  user: one(users, { fields: [shopMembers.userId], references: [users.id] }),
}));

export const shopDomainsRelations = relations(shopDomains, ({ one }) => ({
  shop: one(shops, { fields: [shopDomains.shopId], references: [shops.id] }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  shop: one(shops, { fields: [channels.shopId], references: [shops.id] }),
  sources: many(productSources),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  shop: one(shops, { fields: [products.shopId], references: [shops.id] }),
  variants: many(productVariants),
  images: many(productImages),
  sources: many(productSources),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productSourcesRelations = relations(productSources, ({ one }) => ({
  product: one(products, {
    fields: [productSources.productId],
    references: [products.id],
  }),
  channel: one(channels, {
    fields: [productSources.channelId],
    references: [channels.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  items: many(collectionProducts),
}));

export const collectionProductsRelations = relations(collectionProducts, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionProducts.collectionId],
    references: [collections.id],
  }),
  product: one(products, {
    fields: [collectionProducts.productId],
    references: [products.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

export const cartsRelations = relations(carts, ({ many }) => ({
  lines: many(cartLines),
}));

export const cartLinesRelations = relations(cartLines, ({ one }) => ({
  cart: one(carts, { fields: [cartLines.cartId], references: [carts.id] }),
  variant: one(productVariants, {
    fields: [cartLines.variantId],
    references: [productVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  shop: one(shops, { fields: [orders.shopId], references: [shops.id] }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  lines: many(orderLines),
  payments: many(payments),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  shop: one(shops, { fields: [conversations.shopId], references: [shops.id] }),
  product: one(products, {
    fields: [conversations.productId],
    references: [products.id],
  }),
  buyer: one(users, {
    fields: [conversations.buyerUserId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ── types ───────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Shop = typeof shops.$inferSelect;
export type ShopMember = typeof shopMembers.$inferSelect;
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type Channel = typeof channels.$inferSelect;
export type TelegramUpdateRow = typeof telegramUpdates.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductSource = typeof productSources.$inferSelect;
export type ButtonMode = (typeof buttonModeEnum.enumValues)[number];
export type Collection = typeof collections.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type OrderLine = typeof orderLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
