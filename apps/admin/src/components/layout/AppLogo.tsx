import Image from "next/image"
import Link from "next/link"

const APP_NAME = "tech-english-admin"

/**
 * ロゴを押したときの移り先（ダッシュボード）
 */
const HOME_PATH = "/"

/**
 * 左上のロゴ（マークと「tech-english-admin」の文字。押すと HOME_PATH へ）。サイドバーとスマホ幅のヘッダーで使う。
 * サイドバーを畳んだときは isCompact でマークだけにする
 */
export function AppLogo({ className, isCompact = false }: { className?: string, isCompact?: boolean }) {
  return (
    <Link className={`flex items-center gap-2.5 ${className ?? ""}`} href={HOME_PATH}>
      <Image alt={isCompact ? APP_NAME : ""} height={32} src="/images/logo/logo-icon.svg" width={32} />
      {!isCompact && <span className="text-lg font-semibold text-gray-900 dark:text-white">{APP_NAME}</span>}
    </Link>
  )
}
