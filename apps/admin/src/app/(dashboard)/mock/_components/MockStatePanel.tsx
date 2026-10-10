import Link from "next/link"

/**
 * モック専用：画面の状態を切り替えるパネル
 *
 * 製品の UI ではないことが分かるよう破線の枠にし、普段は畳んで画面の右下に置く。
 */
export function MockStatePanel({ current, states }: { current: string, states: { href: string, key: string, label: string }[] }) {
  const currentLabel = states.find(state => state.key === current)?.label ?? states[0]?.label

  return (
    <details className="group fixed right-4 bottom-4 z-99 max-w-[calc(100vw-2rem)] rounded-xl border border-dashed border-gray-400 bg-white/95 text-xs shadow-theme-lg backdrop-blur dark:border-gray-600 dark:bg-gray-900/95">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-gray-600 marker:hidden dark:text-gray-300">
        <span className="text-gray-400">モック</span>
        {currentLabel}
        <span aria-hidden className="text-gray-400 transition-transform group-open:rotate-180">▴</span>
      </summary>
      <div className="flex flex-wrap gap-1 border-t border-dashed border-gray-300 p-2 dark:border-gray-700">
        {states.map(state => (
          <Link
            key={state.key}
            className={`rounded-md px-2 py-1 transition-colors ${
              state.key === current
                ? "bg-gray-800 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
            href={state.href}
            scroll={false}
          >
            {state.label}
          </Link>
        ))}
        <Link className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5" href="/mock">
          画面一覧
        </Link>
      </div>
    </details>
  )
}
