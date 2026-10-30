import type { SuggestSourceResponse } from "@repo/api-schema"

import { LICENSE_NOTE } from "@/components/features/source/SourceFormParts"
import { isLicenseResolved } from "@/features/source/source.form"
import { formatLicenseLabel } from "@/features/source/source.labels"

type DetectedLicense = Extract<SuggestSourceResponse, { fetch_type: "github_repository" }>["detected_license"]

const describeDetectedLicense = ({ conflict_url: conflictUrl, is_allowed: isAllowed, is_verified: isVerified, license_spdx: licenseSpdx, license_url: licenseUrl }: DetectedLicense): string => {
  if (licenseSpdx === null || licenseUrl === null) return "ライセンスを確認できませんでした"
  if (conflictUrl !== null) return `${licenseSpdx}：ドキュメントに別のライセンスがあるので登録できません`
  if (!isAllowed) return `${licenseSpdx}：許可リストに無いライセンスです`
  return `${licenseSpdx}（${isVerified ? "確認済みのライセンス" : "GitHub が検出したライセンス"}）`
}

function SummaryRow({ children, label }: { children: React.ReactNode, label: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-800 dark:text-white/90">{children}</dd>
    </div>
  )
}

function LicenseUrlLink({ url }: { url: string | null }) {
  if (url === null) return <>―</>
  return <a className="font-mono text-brand-500 hover:text-brand-600" href={url} rel="noreferrer" target="_blank">{url}</a>
}

/**
 * 登録の URL から読み込んだ内容。ライセンスと「詳細」を直す前の値（読み込んだときの値）を出す
 */
export function SourceSuggestionSummary({ suggestion }: { suggestion: SuggestSourceResponse }) {
  const isGitHub = suggestion.fetch_type === "github_repository"
  const isResolved = isLicenseResolved(suggestion)
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-white/3">
      <dl className="space-y-3">
        <SummaryRow label="取得元">
          {isGitHub ? (
            <>
              <span className="font-mono">{suggestion.repository}</span>（ブランチ <span className="font-mono">{suggestion.branch}</span>）
              {suggestion.branch !== suggestion.default_branch && (
                <span className="mt-1 block text-theme-xs text-warning-600 dark:text-warning-500">
                  default branch（<span className="font-mono">{suggestion.default_branch}</span>）ではありません。違っていれば URL を直して読み込み直してください
                </span>
              )}
            </>
          ) : (
            <span className="font-mono">{suggestion.site_url}</span>
          )}
        </SummaryRow>
        <SummaryRow label="対象パス"><span className="font-mono">{suggestion.include_globs.join(", ")}</span></SummaryRow>
        {isGitHub && suggestion.exclude_globs.length > 0 && (
          <SummaryRow label="除外パス">
            変更履歴・翻訳・ブログ・貢献者向けの文書など {suggestion.exclude_globs.length} 件（「詳細」で直せます）
          </SummaryRow>
        )}
        <SummaryRow label="ライセンス">
          <span className={isResolved ? undefined : "text-error-500"}>
            {isGitHub ? describeDetectedLicense(suggestion.detected_license) : formatLicenseLabel(suggestion.license_spdx)}
          </span>
        </SummaryRow>
        <SummaryRow label="ライセンスの記載がある URL">
          <LicenseUrlLink url={isGitHub ? suggestion.detected_license.license_url : suggestion.license_url} />
        </SummaryRow>
        {isGitHub && suggestion.detected_license.conflict_url !== null && (
          <SummaryRow label="別のライセンス"><LicenseUrlLink url={suggestion.detected_license.conflict_url} /></SummaryRow>
        )}
      </dl>
      {isGitHub && isResolved && <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">{LICENSE_NOTE}</p>}
    </div>
  )
}
