ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "chat_type" text DEFAULT 'channel' NOT NULL;
