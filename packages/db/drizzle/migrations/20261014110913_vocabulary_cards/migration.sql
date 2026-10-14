CREATE TABLE "vocabulary_cards" (
	"id" serial PRIMARY KEY,
	"due_date" date,
	"last_reviewed_at" timestamp(3) NOT NULL,
	"lemma" text NOT NULL,
	"stage" smallint NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "vocabulary_cards_lemma_check" CHECK ("lemma" = lower("lemma")),
	CONSTRAINT "vocabulary_cards_stage_check" CHECK ("stage" BETWEEN 0 AND 4),
	CONSTRAINT "vocabulary_cards_due_date_check" CHECK (("stage" = 4) = ("due_date" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_reviews" (
	"id" serial PRIMARY KEY,
	"active_seconds" smallint NOT NULL,
	"card_id" integer NOT NULL,
	"client_review_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"stage_after" smallint NOT NULL,
	"stage_before" smallint,
	"study_date" date NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "vocabulary_reviews_grade_check" CHECK ("grade" IN ('remembered', 'forgot')),
	CONSTRAINT "vocabulary_reviews_active_seconds_check" CHECK ("active_seconds" BETWEEN 0 AND 60),
	CONSTRAINT "vocabulary_reviews_stage_after_check" CHECK ("stage_after" BETWEEN 0 AND 4),
	CONSTRAINT "vocabulary_reviews_stage_before_check" CHECK ("stage_before" IS NULL OR "stage_before" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_cards_user_id_lemma_key" ON "vocabulary_cards" ("user_id","lemma");--> statement-breakpoint
CREATE INDEX "vocabulary_cards_user_id_due_date_idx" ON "vocabulary_cards" ("user_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_reviews_user_id_client_review_id_key" ON "vocabulary_reviews" ("user_id","client_review_id");--> statement-breakpoint
CREATE INDEX "vocabulary_reviews_user_id_study_date_idx" ON "vocabulary_reviews" ("user_id","study_date");--> statement-breakpoint
CREATE INDEX "vocabulary_reviews_card_id_idx" ON "vocabulary_reviews" ("card_id");--> statement-breakpoint
ALTER TABLE "vocabulary_cards" ADD CONSTRAINT "vocabulary_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "vocabulary_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;