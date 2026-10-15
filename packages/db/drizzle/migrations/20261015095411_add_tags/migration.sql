CREATE TABLE "content_source_tags" (
	"content_source_id" integer,
	"tag_id" integer,
	CONSTRAINT "content_source_tags_pkey" PRIMARY KEY("content_source_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY,
	"color" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "tags_color_check" CHECK ("color" IN ('blue', 'rose', 'emerald', 'amber', 'violet', 'teal', 'orange', 'pink', 'lime', 'sky')),
	CONSTRAINT "tags_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 30 AND strpos("name", ',') = 0)
);
--> statement-breakpoint
CREATE INDEX "content_source_tags_tag_id_idx" ON "content_source_tags" ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_key" ON "tags" (lower("name"));--> statement-breakpoint
ALTER TABLE "content_source_tags" ADD CONSTRAINT "content_source_tags_content_source_id_fkey" FOREIGN KEY ("content_source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "content_source_tags" ADD CONSTRAINT "content_source_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- source-tags: 既存のタグの移行（ここから）
/*
 * content_sources.tags（jsonb の文字列の配列）の名前を、前後の空白を除いて大文字・小文字を区別せずに 1 つにまとめ、tags に入れる。
 * - 書き方は id が最小のソース（同じソースの中では配列の先の方）のものを採る
 * - 空文字・空白だけの名前は移さない
 * - 色は lower(name) の順に、TAG_COLORS を先頭から順番に割り当てる
 *
 * 色の配列は、この migration を書いた時点の TAG_COLORS（packages/domain/src/const/tag.ts）の写し。
 * 定数に無い値を書くと tags_color_check に掛かって migration 全体がロールバックされるので、不正な色は入らない。
 * 適用済みの migration は直さないので、あとで TAG_COLORS を変えてもこの配列は変えない
 */
WITH "source_tag_names" AS (
  SELECT "content_sources"."id" AS "source_id", btrim("tag"."name") AS "name", "tag"."position"
  FROM "content_sources"
  CROSS JOIN LATERAL jsonb_array_elements_text("content_sources"."tags") WITH ORDINALITY AS "tag"("name", "position")
  WHERE btrim("tag"."name") <> ''
),
"canonical_names" AS (
  SELECT DISTINCT ON (lower("name")) "name"
  FROM "source_tag_names"
  ORDER BY lower("name"), "source_id", "position"
)
INSERT INTO "tags" ("name", "color", "created_at", "updated_at")
SELECT
  "name",
  (ARRAY['blue', 'rose', 'emerald', 'amber', 'violet', 'teal', 'orange', 'pink', 'lime', 'sky'])[
    ((row_number() OVER (ORDER BY lower("name")) - 1) % 10) + 1
  ],
  now() AT TIME ZONE 'UTC',
  now() AT TIME ZONE 'UTC'
FROM "canonical_names";
--> statement-breakpoint
/*
 * ソースとタグの紐付け。同じソースに大文字・小文字だけが違う名前が 2 つあっても 1 つの紐付けにする（DISTINCT）
 */
INSERT INTO "content_source_tags" ("content_source_id", "tag_id")
SELECT DISTINCT "content_sources"."id", "tags"."id"
FROM "content_sources"
CROSS JOIN LATERAL jsonb_array_elements_text("content_sources"."tags") AS "tag"("name")
INNER JOIN "tags" ON lower("tags"."name") = lower(btrim("tag"."name"))
WHERE btrim("tag"."name") <> '';
-- source-tags: 既存のタグの移行（ここまで）
