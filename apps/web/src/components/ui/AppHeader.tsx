import Link from "next/link"
import { unstable_rethrow } from "next/navigation"

import { getUser } from "@/features/user/get-user"

import { UserAvatar } from "./UserAvatar"
import { Wordmark } from "./Wordmark"

type NavKey = "history" | "home" | "passages" | "settings" | "vocabulary"

const NAV_ITEMS: { href: string, key: NavKey, label: string }[] = [
  { href: "/", key: "home", label: "マイページ" },
  { href: "/passages", key: "passages", label: "問題" },
  { href: "/vocabulary", key: "vocabulary", label: "単語帳" },
  { href: "/history", key: "history", label: "履歴" },
  { href: "/settings", key: "settings", label: "設定" },
]

export async function AppHeader({ current }: { current: NavKey }) {
  /**
   * ヘッダーの取得失敗でページ全体を落とさない（アバターの代わりに空の丸を出す）。
   * ただし getUser のセッション切れの redirect（api が期限内の access token を拒んだ）は握りつぶさずに投げ直し、ログイン画面へ移す
   */
  const user = await getUser().catch((error: unknown) => {
    unstable_rethrow(error)
    return null
  })

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4 sm:h-14 sm:flex-nowrap sm:px-6">
        <div className="flex h-14 items-center"><Wordmark /></div>
        <nav
          aria-label="メイン"
          className="order-last -mx-4 flex h-11 w-[calc(100%+2rem)] items-stretch justify-around border-t border-line sm:order-none sm:mx-0 sm:h-full sm:w-auto sm:min-w-0 sm:flex-1 sm:justify-start sm:gap-1 sm:border-t-0"
        >
          {NAV_ITEMS.map(item => (
            <Link
              key={item.key}
              aria-current={item.key === current ? "page" : undefined}
              className={`flex shrink-0 items-center border-b-2 px-3 pt-0.5 text-sm outline-none transition-colors focus-visible:bg-raised ${
                item.key === current ? "border-amber text-fg" : "border-transparent text-fg-muted hover:text-fg"
              }`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <UserAvatar
          avatarUrl={user?.avatar_url ?? null}
          className="ml-auto size-8 text-sm sm:ml-0"
          name={user?.name ?? null}
          size={32}
        />
      </div>
    </header>
  )
}
