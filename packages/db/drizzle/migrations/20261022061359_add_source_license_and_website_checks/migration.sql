-- サイトのソースは収集しないので常に無効にする。sources_website_disabled_check を足す前に、有効のサイトのソースを無効にする
UPDATE "sources" SET "is_enabled" = false WHERE "fetch_type" = 'website';--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_personal_use_license_check" CHECK ("fetch_type" = 'website' OR "license_spdx" <> 'LicenseRef-personal-use');--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_website_disabled_check" CHECK ("fetch_type" <> 'website' OR "is_enabled" = false);--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_license_spdx_check", ADD CONSTRAINT "sources_license_spdx_check" CHECK ("license_spdx" IN ('MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-4.0', 'PSF-2.0', 'CC0-1.0', 'Unlicense', 'LicenseRef-personal-use'));