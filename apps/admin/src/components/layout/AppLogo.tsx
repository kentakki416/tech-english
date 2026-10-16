import Link from "next/link"

import { appConfig } from "@/config/app"

const HOME_PATH = "/"

type AppLogoProps = {
  className?: string
  /**
   * アプリ名の文字を出さず、頭文字のアイコンだけにする
   */
  isCompact?: boolean
  /**
   * inverse は暗い背景用に文字を白にする
   */
  tone?: "default" | "inverse"
}

/**
 * アプリのロゴ（押すとダッシュボードへ）。
 * 画像のロゴにしたいときは、この部品の中身を <Image> に差し替える（呼び出し側は変えない）
 */
export function AppLogo({ className, isCompact = false, tone = "default" }: AppLogoProps) {
  return (
    <Link aria-label={isCompact ? appConfig.name : undefined} className={`flex items-center gap-2.5 ${className ?? ""}`} href={HOME_PATH}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white">
        {appConfig.name.charAt(0).toUpperCase()}
      </span>
      {!isCompact && (
        <span className={`text-lg font-semibold ${tone === "inverse" ? "text-white" : "text-gray-900 dark:text-white"}`}>
          {appConfig.name}
        </span>
      )}
    </Link>
  )
}
