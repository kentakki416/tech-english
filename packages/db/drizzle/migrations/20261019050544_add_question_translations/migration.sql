ALTER TABLE "questions" ADD COLUMN "choices_ja" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "prompt_ja" text;--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD COLUMN "translated_question_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_choices_ja_check" CHECK ("choices_ja" IS NULL OR "type" <> 'vocabulary');