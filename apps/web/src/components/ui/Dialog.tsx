/**
 * 背面の操作を止めるのは呼び出し側（背面を inert にする）。閉じ方（Esc・ボタン）も呼び出し側が持つ
 */
export function Dialog({ children, labelledBy }: { children: React.ReactNode, labelledBy: string }) {
  return (
    <div aria-modal aria-labelledby={labelledBy} className="fixed inset-0 z-60 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog">
      <div className="w-full max-w-md rounded-xl border border-line-strong bg-raised p-6 shadow-2xl">{children}</div>
    </div>
  )
}
