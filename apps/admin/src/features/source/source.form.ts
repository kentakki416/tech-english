/**
 * ソースの登録・編集フォームの FormData を、API のリクエストの形（snake_case）に変換する。
 * 検証は呼び出し側（Server Action）が @repo/api-schema のスキーマで行うので、ここでは形を整えるだけにする
 */

/**
 * 文字列の値。未送信（null）やファイルは空文字にする
 */
const getText = (formData: FormData, key: string): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

/**
 * 必須の選択肢（ラジオ・セレクト）。未選択なら undefined にして、Zod に「Required」を出させる
 */
const getChoice = (formData: FormData, key: string): string | undefined => {
  const value = formData.get(key)
  return typeof value === "string" && value !== "" ? value : undefined
}

/**
 * 任意の 1 行の項目。空なら null
 */
const getNullableText = (formData: FormData, key: string): string | null => {
  const value = getText(formData, key).trim()
  return value === "" ? null : value
}

/**
 * テキストエリア（1 行に 1 つ）。改行で分けて trim し、空行を捨てる
 */
const splitLines = (formData: FormData, key: string): string[] =>
  getText(formData, key)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")

/**
 * 同じ name の hidden の input（タグの選択）の id。数値にできない値は NaN のまま残し、Zod に弾かせる
 */
const getIds = (formData: FormData, key: string): number[] =>
  formData.getAll(key).map((value) => (typeof value === "string" && value !== "" ? Number(value) : Number.NaN))

/**
 * フォームの入力をソースの登録・更新のリクエストに変換する。
 * 取得方法（fetch_type）に応じて、もう一方の取得方法の項目は入れない
 */
export const convertFormDataToSourceRequest = (formData: FormData): Record<string, unknown> => {
  const fetchType = getText(formData, "fetch_type")
  const common = {
    exclude_globs: splitLines(formData, "exclude_globs"),
    fetch_type: fetchType,
    include_globs: splitLines(formData, "include_globs"),
    kind: getChoice(formData, "kind"),
    license_spdx: getChoice(formData, "license_spdx"),
    license_url: getText(formData, "license_url").trim(),
    name: getText(formData, "name"),
    tag_ids: getIds(formData, "tag_ids"),
  }

  if (fetchType === "github_repository") {
    return {
      ...common,
      branch: getText(formData, "branch"),
      is_enabled: getText(formData, "is_enabled") === "true",
      public_url_strip_prefix: getNullableText(formData, "public_url_strip_prefix"),
      public_url_template: getNullableText(formData, "public_url_template"),
      repository: getText(formData, "repository").trim(),
    }
  }

  if (fetchType === "website") {
    /**
     * ページの見つけ方で選ばなかった方の URL は null にする
     */
    const discoveryUrl = getNullableText(formData, "discovery_url")
    const isSitemap = getText(formData, "discovery") === "sitemap"
    return {
      ...common,
      content_selector: getNullableText(formData, "content_selector"),
      exclude_selectors: splitLines(formData, "exclude_selectors"),
      site_url: getText(formData, "site_url").trim(),
      sitemap_url: isSitemap ? discoveryUrl : null,
      start_url: isSitemap ? null : discoveryUrl,
    }
  }

  /**
   * 取得方法が不正なら、そのまま Zod の検証で fetch_type のエラーにする
   */
  return common
}
