ALTER TABLE "shops" ALTER COLUMN "settings" SET DEFAULT '{"defaultCurrency":"ETB","autoPublishMinConfidence":0.8,"linkMode":"reply","ingestMode":"auto_publish","shopVisible":true,"sellerNotifyOrders":true,"sellerNotifyMessages":true,"autoArchiveDays":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_negotiable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shipping_info" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "return_policy" text;--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_media_group_uidx" ON "products" USING btree ("shop_id","source_media_group_id") WHERE "products"."source_media_group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_source_msg_uidx" ON "products" USING btree ("shop_id","source_chat_id","source_message_id") WHERE "products"."source_chat_id" is not null and "products"."source_message_id" is not null;