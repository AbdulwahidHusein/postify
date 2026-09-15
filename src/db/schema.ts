import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").notNull().default(false),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ShopSettings = {
  defaultCurrency: string;
  autoPublishMinConfidence: number;
  linkMode: "reply" | "bot_owned";
  /** @channel or t.me link shown on storefront */
  telegramChannel?: string | null;
  /** Optional public owner / seller handle */
  ownerUsername?: string | null;
  /** Optional contact phone */
  ownerPhone?: string | null;
  /** Categories this shop sells */
  sellCategories?: string[];
  /** Public logo URL (/api/media/file/... or similar) */
  logoUrl?: string | null;
  /** How logo was set — telegram sync can overwrite unless upload */
  logoSource?: "telegram" | "upload" | null;
  /** How channel posts become products */
  ingestMode?: "auto_publish" | "always_draft" | "paused";
  /** Shop visible on public storefront? (false = hidden while building) */
  shopVisible?: boolean;
  /** Seller Telegram notifications */
  sellerNotifyOrders?: boolean;
  sellerNotifyMessages?: boolean;
  /** Auto-archive published products after N days unsold (null = disabled) */
  autoArchiveDays?: number | null;
};


export const shops = pgTable(
  "shops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    settings: jsonb("settings")
      .$type<ShopSettings>()
      .notNull()
      .default({
        defaultCurrency: "ETB",
        autoPublishMinConfidence: 0.8,
        linkMode: "reply",
        ingestMode: "auto_publish",
        shopVisible: true,
        sellerNotifyOrders: true,
        sellerNotifyMessages: true,
        autoArchiveDays: null,
      }),
    connectCode: text("connect_code"),
    connectCodeExpiresAt: timestamp("connect_code_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("shops_slug_uidx").on(table.slug),
    uniqueIndex("shops_connect_code_uidx").on(table.connectCode),
  ],
);

export const channelStatusEnum = pgEnum("channel_status", [
  "connected",
  "disconnected",
]);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    telegramChatId: bigint("telegram_chat_id", { mode: "bigint" })
      .notNull()
      .unique(),
    title: text("title"),
    username: text("username"),
    status: channelStatusEnum("status").notNull().default("connected"),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }),
    lastPostMessageId: integer("last_post_message_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("channels_shop_id_uidx").on(table.shopId)],
);

export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    /** Safe relative path after confirm, e.g. /inbox or /auth/continue?message=… */
    redirectPath: text("redirect_path"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("login_tokens_token_uidx").on(table.token)],
);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "published",
  "sold",
  "archived",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 14, scale: 2 }),
    compareAtPrice: numeric("compare_at_price", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("ETB"),
    category: text("category"),
    sku: text("sku"),
    stockQuantity: integer("stock_quantity"),
    tags: text("tags"),
    status: productStatusEnum("status").notNull().default("published"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    rawCaption: text("raw_caption"),
    sourceChatId: bigint("source_chat_id", { mode: "bigint" }),
    sourceMessageId: integer("source_message_id"),
    sourceMediaGroupId: text("source_media_group_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_uidx").on(table.slug),
    // Album dedup: one product per (shop, media_group). NULLs are distinct so
    // manual products (no media group) never collide.
    uniqueIndex("products_shop_media_group_uidx")
      .on(table.shopId, table.sourceMediaGroupId)
      .where(sql`${table.sourceMediaGroupId} is not null`),
    // Message dedup: one product per (shop, chat, message) — guards against
    // concurrent webhook processing / Telegram retries creating duplicates.
    uniqueIndex("products_shop_source_msg_uidx")
      .on(table.shopId, table.sourceChatId, table.sourceMessageId)
      .where(
        sql`${table.sourceChatId} is not null and ${table.sourceMessageId} is not null`,
      ),
  ],
);

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  telegramFileId: text("telegram_file_id"),
  url: text("url"),
  alt: text("alt"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  shops: many(shops),
}));

export const shopsRelations = relations(shops, ({ one, many }) => ({
  owner: one(users, {
    fields: [shops.ownerUserId],
    references: [users.id],
  }),
  channels: many(channels),
  products: many(products),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  shop: one(shops, {
    fields: [channels.shopId],
    references: [shops.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  shop: one(shops, {
    fields: [products.shopId],
    references: [shops.id],
  }),
  channel: one(channels, {
    fields: [products.channelId],
    references: [channels.id],
  }),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "closed",
]);

export const messageSenderRoleEnum = pgEnum("message_sender_role", [
  "buyer",
  "seller",
  "system",
]);

export const messageKindEnum = pgEnum("message_kind", [
  "text",
  "image",
  "product",
]);

export const deliveryChannelEnum = pgEnum("delivery_channel", [
  "telegram_seller",
  "telegram_buyer",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    sellerUnreadCount: integer("seller_unread_count").notNull().default(0),
    buyerUnreadCount: integer("buyer_unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_shop_product_buyer_uidx").on(
      table.shopId,
      table.productId,
      table.buyerUserId,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderRole: messageSenderRoleEnum("sender_role").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: messageKindEnum("kind").notNull().default("text"),
    body: text("body").notNull().default(""),
    imageUrl: text("image_url"),
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_conversation_client_uidx").on(
      table.conversationId,
      table.clientId,
    ),
  ],
);

export const messageDeliveries = pgTable(
  "message_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    channel: deliveryChannelEnum("channel").notNull(),
    telegramChatId: bigint("telegram_chat_id", { mode: "bigint" }).notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("message_deliveries_telegram_uidx").on(
      table.telegramChatId,
      table.telegramMessageId,
    ),
  ],
);

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Seller tapped Reply in Telegram — next text binds to this conversation. */
export const chatReplyContexts = pgTable(
  "chat_reply_contexts",
  {
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "confirmed",
  "fulfilled",
  "cancelled",
]);

/** Order intent — cash/transfer offline; payments come later. */
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  buyerUserId: uuid("buyer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  status: orderStatusEnum("status").notNull().default("new"),
  quantity: integer("quantity").notNull().default(1),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone").notNull(),
  notes: text("notes"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("ETB"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    shop: one(shops, {
      fields: [conversations.shopId],
      references: [shops.id],
    }),
    product: one(products, {
      fields: [conversations.productId],
      references: [products.id],
    }),
    buyer: one(users, {
      fields: [conversations.buyerUserId],
      references: [users.id],
    }),
    messages: many(messages),
    orders: many(orders),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
  deliveries: many(messageDeliveries),
}));

export const messageDeliveriesRelations = relations(
  messageDeliveries,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageDeliveries.messageId],
      references: [messages.id],
    }),
  }),
);

export const ordersRelations = relations(orders, ({ one }) => ({
  shop: one(shops, {
    fields: [orders.shopId],
    references: [shops.id],
  }),
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  buyer: one(users, {
    fields: [orders.buyerUserId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [orders.conversationId],
    references: [conversations.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type LoginToken = typeof loginTokens.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
