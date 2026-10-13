CREATE TABLE "passage_glossary_entries" (
	"id" serial PRIMARY KEY,
	"block_index" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"lemma" text NOT NULL,
	"meaning_ja" text NOT NULL,
	"note_ja" text,
	"part_of_speech" text,
	"passage_id" integer NOT NULL,
	"start_offset" integer NOT NULL,
	"surface" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "passage_glossary_entries_offset_check" CHECK ("start_offset" >= 0 AND "end_offset" > "start_offset")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY,
	"choices" jsonb NOT NULL,
	"correct_choice_index" smallint NOT NULL,
	"evidence_block_index" integer NOT NULL,
	"evidence_quote" text NOT NULL,
	"explanation_ja" text NOT NULL,
	"order_index" smallint NOT NULL,
	"passage_id" integer NOT NULL,
	"prompt" text NOT NULL,
	"target_glossary_entry_id" integer,
	"type" text NOT NULL,
	"verification_choice_index" smallint,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "questions_type_check" CHECK ("type" IN ('main_idea', 'detail', 'vocabulary', 'inference', 'purpose')),
	CONSTRAINT "questions_correct_choice_index_check" CHECK ("correct_choice_index" BETWEEN 0 AND 3),
	CONSTRAINT "questions_target_glossary_entry_check" CHECK ("target_glossary_entry_id" IS NULL OR "type" = 'vocabulary')
);
--> statement-breakpoint
CREATE INDEX "passage_glossary_entries_passage_id_idx" ON "passage_glossary_entries" ("passage_id");--> statement-breakpoint
CREATE INDEX "passage_glossary_entries_lemma_idx" ON "passage_glossary_entries" ("lemma");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_passage_id_order_index_key" ON "questions" ("passage_id","order_index");--> statement-breakpoint
ALTER TABLE "passage_glossary_entries" ADD CONSTRAINT "passage_glossary_entries_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_target_glossary_entry_id_fkey" FOREIGN KEY ("target_glossary_entry_id") REFERENCES "passage_glossary_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;