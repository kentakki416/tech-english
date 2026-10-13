"use client"

import { useEffect, useEffectEvent } from "react"

type AttemptShortcutOptions = {
  /**
   * 提出の確認・ショートカット一覧が開いている。開いている間は Esc（閉じる）だけ受け付ける
   */
  isDialogOpen: boolean
  /**
   * 一時停止中・期限切れ・提出中は false。ダイアログ以外の操作をすべて止める
   */
  isEnabled: boolean
  /**
   * 提出中は Esc でもダイアログを閉じない
   */
  isSubmitting: boolean
  onChoose: (choiceIndex: number) => void
  onCloseDialog: () => void
  onMoveQuestion: (delta: number) => void
  onOpenShortcuts: () => void
  onOpenSubmitConfirm: () => void
  onToggleAllTranslations: () => void
}

const CHOICE_KEYS = ["1", "2", "3", "4"]

/**
 * 入力欄にフォーカスがあるときは、打った文字をショートカットとして扱わない
 */
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))

/**
 * 解答画面のキーボード操作（reading-practice README「キーボード操作（web）」）。
 * `1`〜`4` 回答、`J` / `K` 設問の移動、`T` 全文訳、`?` ショートカット一覧、`Ctrl` / `⌘` + `Enter` 提出の確認、`Esc` ダイアログを閉じる。
 * 単語のカードの `Esc` は PassageReader が持つ
 */
export function useAttemptShortcuts(options: AttemptShortcutOptions): void {
  /**
   * 毎秒描き直されても keydown の登録をやり直さないよう、最新の options を読む Effect Event にする
   */
  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || isEditableTarget(event.target)) return

    if (options.isDialogOpen) {
      if (event.key === "Escape" && !options.isSubmitting) options.onCloseDialog()
      return
    }
    if (!options.isEnabled) return

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      options.onOpenSubmitConfirm()
      return
    }
    /**
     * ブラウザのショートカット（⌘ + 1 のタブ切り替えなど）は奪わない
     */
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const key = event.key.toLowerCase()
    if (CHOICE_KEYS.includes(key)) options.onChoose(Number(key) - 1)
    else if (key === "j") options.onMoveQuestion(1)
    else if (key === "k") options.onMoveQuestion(-1)
    else if (key === "t") options.onToggleAllTranslations()
    else if (key === "?") options.onOpenShortcuts()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeydown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
}
