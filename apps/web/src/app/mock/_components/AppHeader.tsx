import Link from "next/link"

import { MOCK_USER } from "@/libs/mock-data"

import { Wordmark } from "./Wordmark"

type NavKey = "history" | "home" | "passages" | "settings" | "vocabulary"

const NAV_ITEMS: { href: string, key: NavKey, label: string }[] = [
  { href: "/mock/home", key: "home", label: "マイページ" },
  { href: "/mock/passages", key: "passages", label: "問題" },
  { href: "/mock/vocabulary", key: "vocabulary", label: "単語帳" },
  { href: "/mock/history", key: "history", label: "履歴" },
  { href: "/mock/settings", key: "settings", label: "設定" },
]

/**
 * ログイン後の共通ヘッダー（解答画面以外）
 */
export function AppHeader({ current }: { current: NavKey }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
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
        <span
          aria-label={MOCK_USER.name}
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-raised text-sm font-semibold text-fg sm:ml-0"
          role="img"
        >
          {MOCK_USER.avatarInitial}
        </span>
      </div>
    </header>
  )
}
