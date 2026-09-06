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
import { relations } from "drizzle-orm";

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
  (table) => [uniqueIndex("products_slug_uidx").on(table.slug)],
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type LoginToken = typeof loginTokens.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
