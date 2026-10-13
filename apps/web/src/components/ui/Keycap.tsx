/**
 * キーボードショートカットのキー表示
 */
export function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-b-2 border-line-strong bg-raised px-1 font-code text-[11px] leading-none text-fg-muted">
      {children}
    </kbd>
  )
}
