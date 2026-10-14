import { sql } from "drizzle-orm"
import { boolean, check, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"

/**
 * 英文の取得元（ソース）。管理者が登録する
 *
 * 取得方法（fetch_type）ごとの列は 1 テーブルに nullable で並べ、必須は CHECK 制約で保証する。
 * 制約・index 名は Prisma の既定の命名（{table}_{columns}_key / _idx / _fkey）に合わせている（併存中の schema.prisma と一致させるため）。
 */
export const contentSources = pgTable(
  "content_sources",
  {
    id: serial("id").primaryKey(),
    /**
     * GitHub のみ
     */
    branch: text("branch"),
    /**
     * サイトのみ。本文の CSS セレクタ。未設定なら自動で本文を推定する
     */
    contentSelector: text("content_selector"),
    excludeGlobs: jsonb("exclude_globs").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * サイトのみ。本文の中から取り除く要素の CSS セレクタ
     */
    excludeSelectors: jsonb("exclude_selectors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    fetchType: text("fetch_type", { enum: SOURCE_FETCH_TYPES }).notNull(),
    includeGlobs: jsonb("include_globs").$type<string[]>().notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    kind: text("kind", { enum: SOURCE_KINDS }).notNull(),
    lastCollectedAt: timestamp("last_collected_at", { mode: "date", precision: 3 }),
    /**
     * GitHub のみ。最後に全ファイルを処理し終えたコミット
     */
    lastCollectedCommitSha: text("last_collected_commit_sha"),
    licenseSpdx: text("license_spdx", { enum: ALLOWED_LICENSES }).notNull(),
    licenseUrl: text("license_url").notNull(),
    name: text("name").notNull(),
    /**
     * GitHub のみ
     */
    publicUrlStripPrefix: text("public_url_strip_prefix"),
    /**
     * GitHub のみ。公開ページの URL 規則（例: https://react.dev/{path}）
     */
    publicUrlTemplate: text("public_url_template"),
    /**
     * GitHub のみ。owner/name
     */
    repository: text("repository"),
    /**
     * サイトのみ
     */
    sitemapUrl: text("sitemap_url"),
    /**
     * サイトのみ。オリジン（https://go.dev）
     */
    siteUrl: text("site_url"),
    /**
     * サイトのみ。開始ページの URL
     */
    startUrl: text("start_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    check("content_sources_kind_check", sql`${table.kind} IN (${joinSqlValues(SOURCE_KINDS)})`),
    check("content_sources_fetch_type_check", sql`${table.fetchType} IN (${joinSqlValues(SOURCE_FETCH_TYPES)})`),
    check("content_sources_license_spdx_check", sql`${table.licenseSpdx} IN (${joinSqlValues(ALLOWED_LICENSES)})`),
    check(
      "content_sources_github_repository_check",
      sql`${table.fetchType} <> 'github_repository' OR (${table.repository} IS NOT NULL AND ${table.branch} IS NOT NULL)`,
    ),
    check(
      "content_sources_website_check",
      sql`${table.fetchType} <> 'website' OR (${table.siteUrl} IS NOT NULL AND (${table.sitemapUrl} IS NOT NULL OR ${table.startUrl} IS NOT NULL))`,
    ),
    /**
     * NULL 同士は重複しないので、取得方法が違うソースの NULL は unique に掛からない
     */
    uniqueIndex("content_sources_repository_key").on(table.repository),
    uniqueIndex("content_sources_site_url_key").on(table.siteUrl),
  ],
)
