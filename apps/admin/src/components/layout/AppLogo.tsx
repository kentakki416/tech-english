import Image from "next/image"

const APP_NAME = "tech-english-admin"

/**
 * 左上のロゴ（マークと「tech-english-admin」の文字）。サイドバーを畳んだときは isCompact でマークだけにする
 */
export function AppLogo({ isCompact = false }: { isCompact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Image alt={isCompact ? APP_NAME : ""} height={32} src="/images/logo/logo-icon.svg" width={32} />
      {!isCompact && <span className="text-lg font-semibold text-gray-900 dark:text-white">{APP_NAME}</span>}
    </span>
  )
}
