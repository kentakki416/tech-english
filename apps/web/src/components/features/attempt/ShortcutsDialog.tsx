import { Dialog } from "@/components/ui/Dialog"
import { Keycap } from "@/components/ui/Keycap"

const SHORTCUTS: { keys: string[], label: string }[] = [
  { keys: ["1", "2", "3", "4"], label: "選択肢 A〜D を選ぶ" },
  { keys: ["J"], label: "次の設問へ" },
  { keys: ["K"], label: "前の設問へ" },
  { keys: ["T"], label: "全文の和訳を切り替え" },
  { keys: ["R"], label: "読み上げの再生・一時停止" },
  { keys: ["Esc"], label: "単語のカードを閉じる" },
  { keys: ["⌘", "Enter"], label: "提出する" },
  { keys: ["?"], label: "この一覧を表示" },
]

/**
 * キーボードショートカットの一覧（`?` またはステータスバーの「ショートカット」で開く）
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog labelledBy="shortcuts-title">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg" id="shortcuts-title">キーボードショートカット</h2>
        <button
          autoFocus
          className="-mr-1.5 rounded px-1.5 py-0.5 text-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
          onClick={onClose}
          type="button"
        >
          閉じる
        </button>
      </div>
      <dl className="mt-4 divide-y divide-line">
        {SHORTCUTS.map(shortcut => (
          <div key={shortcut.label} className="flex items-center justify-between py-2.5">
            <dt className="text-sm text-fg">{shortcut.label}</dt>
            <dd className="flex gap-1">{shortcut.keys.map(key => <Keycap key={key}>{key}</Keycap>)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-fg-faint">Windows / Linux では ⌘ の代わりに Ctrl を使います。</p>
    </Dialog>
  )
}
