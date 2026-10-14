CREATE TABLE "reminder_settings" (
	"id" serial PRIMARY KEY,
	"is_enabled" boolean NOT NULL,
	"time" time(0) NOT NULL,
	"user_id" integer NOT NULL,
	"weekdays" jsonb NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_settings_user_id_key" ON "reminder_settings" ("user_id");--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;