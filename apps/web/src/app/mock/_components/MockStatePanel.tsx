import Link from "next/link"

/**
 * モック専用：画面の状態（空・時間超過など）を切り替えるパネル
 *
 * 製品の UI ではないことが分かるよう破線の枠にし、普段は畳んで画面の隅に置く。
 */
export function MockStatePanel({
  basePath,
  current,
  links = [],
  states,
}: {
  basePath: string
  current: string
  /**
   * 状態の他に並べるリンク（別のデザイン案など）
   */
  links?: { href: string, label: string }[]
  states: { key: string, label: string }[]
}) {
  const currentLabel = states.find(state => state.key === current)?.label ?? states[0]?.label

  return (
    <details className="group fixed bottom-24 left-3 lg:bottom-16 z-50 max-w-[calc(100vw-1.5rem)] rounded-lg border border-dashed border-fg-faint bg-canvas/95 text-xs shadow-xl backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-fg-muted marker:hidden hover:text-fg">
        <span className="text-fg-faint">モック</span>
        {currentLabel}
        <span aria-hidden className="text-fg-faint transition-transform group-open:rotate-180">▴</span>
      </summary>
      <div className="flex flex-wrap gap-1 border-t border-dashed border-fg-faint p-2">
        {states.map(state => (
          <Link
            key={state.key}
            className={`rounded px-2 py-1 transition-colors ${
              state.key === current ? "bg-fg text-canvas" : "text-fg-muted hover:bg-raised hover:text-fg"
            }`}
            href={state.key === states[0].key ? basePath : `${basePath}?state=${state.key}`}
            scroll={false}
          >
            {state.label}
          </Link>
        ))}
        {links.map(link => (
          <Link key={link.href} className="rounded px-2 py-1 text-amber hover:bg-raised hover:text-amber-bright" href={link.href}>
            {link.label}
          </Link>
        ))}
        <Link className="rounded px-2 py-1 text-fg-faint hover:bg-raised hover:text-fg" href="/mock">
          画面一覧
        </Link>
      </div>
    </details>
  )
}
