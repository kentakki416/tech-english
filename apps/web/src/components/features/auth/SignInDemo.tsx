"use client"

import { useState } from "react"

import { PassageReader } from "@/components/features/passage/PassageReader"

import { DEMO_BLOCKS, DEMO_DICTIONARY, DEMO_GLOSSARY } from "./sign-in-demo-data"

/**
 * ログイン画面の体験デモ。実際の解答画面と同じ部品で、単語の意味と和訳を試せる
 */
export function SignInDemo() {
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_80px_rgb(0_0_0/0.35)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-fg-muted">
        <span className="rounded border border-amber/40 px-1.5 py-px text-[11px] text-amber">Docs</span>
        React 公式ドキュメント
        <span className="ml-auto tabular-nums text-fg">残り 4:12</span>
      </div>
      <div className="px-1 pt-6 pb-2 sm:px-3">
        <PassageReader
          blocks={DEMO_BLOCKS}
          dictionary={DEMO_DICTIONARY}
          fontSize="sm"
          glossary={DEMO_GLOSSARY}
          translatedBlocks={translatedBlocks}
          onToggleTranslation={(blockIndex) => {
            setTranslatedBlocks((value) => {
              const next = new Set(value)
              if (next.has(blockIndex)) next.delete(blockIndex)
              else next.add(blockIndex)
              return next
            })
          }}
        />
      </div>
      <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-fg-muted">
        単語をクリックすると、この文での意味が出ます。段落番号の下の「訳」で和訳に切り替わります。
      </p>
    </div>
  )
}
