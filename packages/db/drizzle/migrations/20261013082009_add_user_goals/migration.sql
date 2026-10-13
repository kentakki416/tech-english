CREATE TABLE "user_goals" (
	"id" serial PRIMARY KEY,
	"goal_text" varchar(200),
	"target_date" date,
	"user_id" integer NOT NULL,
	"weekly_metric" text,
	"weekly_target" integer,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "user_goals_weekly_metric_check" CHECK ("weekly_metric" IN ('passages', 'minutes')),
	CONSTRAINT "user_goals_weekly_pair_check" CHECK (("weekly_metric" IS NULL) = ("weekly_target" IS NULL)),
	CONSTRAINT "user_goals_weekly_target_check" CHECK ("weekly_target" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_goals_user_id_key" ON "user_goals" ("user_id");--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;