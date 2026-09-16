CREATE INDEX IF NOT EXISTS "products_shop_status_category_idx" ON "products" USING btree ("shop_id","status","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_shop_status_brand_idx" ON "products" USING btree ("shop_id","status","brand");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_shop_status_model_idx" ON "products" USING btree ("shop_id","status","model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_shop_status_condition_idx" ON "products" USING btree ("shop_id","status","condition");
