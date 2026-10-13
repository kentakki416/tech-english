CREATE TABLE "attempt_answers" (
	"id" serial PRIMARY KEY,
	"attempt_id" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"question_id" integer NOT NULL,
	"selected_choice_index" smallint,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "attempt_answers_selected_choice_index_check" CHECK ("selected_choice_index" IS NULL OR "selected_choice_index" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "attempt_word_lookups" (
	"id" serial PRIMARY KEY,
	"attempt_id" integer NOT NULL,
	"glossary_entry_id" integer,
	"lemma" text NOT NULL,
	"passage_id" integer NOT NULL,
	"source" text NOT NULL,
	"surface" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "attempt_word_lookups_source_check" CHECK ("source" IN ('glossary', 'dictionary'))
);
--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" serial PRIMARY KEY,
	"headword" text NOT NULL,
	"meaning_ja" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "dictionary_entries_headword_check" CHECK ("headword" = lower("headword"))
);
--> statement-breakpoint
CREATE TABLE "reading_attempts" (
	"id" serial PRIMARY KEY,
	"correct_count" smallint,
	"elapsed_seconds" integer,
	"is_overtime" boolean,
	"passage_id" integer NOT NULL,
	"question_count" smallint,
	"started_at" timestamp(3) NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"study_date" date,
	"submitted_at" timestamp(3),
	"time_limit_seconds" integer NOT NULL,
	"translated_block_count" smallint DEFAULT 0 NOT NULL,
	"user_id" integer NOT NULL,
	"word_lookup_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "reading_attempts_status_check" CHECK ("status" IN ('in_progress', 'submitted', 'expired')),
	CONSTRAINT "reading_attempts_submitted_columns_check" CHECK ("status" <> 'submitted' OR ("submitted_at" IS NOT NULL AND "elapsed_seconds" IS NOT NULL AND "is_overtime" IS NOT NULL AND "question_count" IS NOT NULL AND "correct_count" IS NOT NULL AND "study_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers" ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "attempt_word_lookups_user_id_lemma_idx" ON "attempt_word_lookups" ("user_id","lemma");--> statement-breakpoint
CREATE INDEX "attempt_word_lookups_attempt_id_idx" ON "attempt_word_lookups" ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_entries_headword_key" ON "dictionary_entries" ("headword");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_attempts_user_id_passage_id_in_progress_key" ON "reading_attempts" ("user_id","passage_id") WHERE "status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "reading_attempts_user_id_study_date_idx" ON "reading_attempts" ("user_id","study_date");--> statement-breakpoint
CREATE INDEX "reading_attempts_user_id_passage_id_idx" ON "reading_attempts" ("user_id","passage_id");--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "reading_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_word_lookups" ADD CONSTRAINT "attempt_word_lookups_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "reading_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_word_lookups" ADD CONSTRAINT "attempt_word_lookups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_word_lookups" ADD CONSTRAINT "attempt_word_lookups_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attempt_word_lookups" ADD CONSTRAINT "attempt_word_lookups_glossary_entry_id_fkey" FOREIGN KEY ("glossary_entry_id") REFERENCES "passage_glossary_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD CONSTRAINT "reading_attempts_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;