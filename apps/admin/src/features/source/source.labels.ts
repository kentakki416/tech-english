import type { GetSourceResponse } from "@repo/api-schema"

/**
 * ソースの表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値は `@repo/api-schema` の型で検査する（Zod のスキーマは bundle に入れないため import しない）
 */

type SourceLicense = GetSourceResponse["source"]["license_spdx"]

const PERSONAL_USE_LICENSE: Extract<SourceLicense, "LicenseRef-personal-use"> = "LicenseRef-personal-use"

/**
 * ライセンスの表示名。個人の学習用だけ日本語の名前にし、ほかは SPDX 識別子のまま出す
 */
export const formatLicenseLabel = (license: string): string =>
  license === PERSONAL_USE_LICENSE ? "個人の学習用（ライセンスなし）" : license
