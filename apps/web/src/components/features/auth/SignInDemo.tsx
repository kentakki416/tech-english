"use client"

import { useState } from "react"

import { PassageReader } from "@/components/features/passage/PassageReader"

import { DEMO_BLOCKS, DEMO_GLOSSARY, lookUpDemoDictionary } from "./sign-in-demo-data"
import { useCardTilt } from "./use-card-tilt"

/**
 * 傾けている間だけ transform を付ける（平らなときは付けない）。動かしている間は短い transition で滑らかにし、外れたらゆっくり戻す
 */
const TILT_CARD_CLASS = "transition-transform duration-500 ease-out group-data-[tilting=true]/tilt:duration-150 group-data-[tilting=true]/tilt:[transform:perspective(1200px)_rotateX(var(--tilt-rotate-x))_rotateY(var(--tilt-rotate-y))]"

/**
 * カーソルの位置に重ねる薄い光
 */
const TILT_GLARE_CLASS = "pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_var(--tilt-glare-x)_var(--tilt-glare-y),rgb(255_255_255/0.07),transparent_55%)] opacity-0 transition-opacity duration-500 group-data-[tilting=true]/tilt:opacity-100"

/**
 * ログイン画面の体験デモ。実際の解答画面と同じ部品で、単語の意味と和訳を試せる。
 * マウスに合わせてカードが傾く（単語のカードを開いている間は止める）
 */
export function SignInDemo() {
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [isWordCardOpen, setIsWordCardOpen] = useState(false)
  const tiltRef = useCardTilt<HTMLDivElement>(isWordCardOpen)

  return (
    <div className="group/tilt" ref={tiltRef}>
      <div className={`relative overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_80px_rgb(0_0_0/0.35)] ${TILT_CARD_CLASS}`}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-fg-muted">
          React 公式ドキュメント
          <span className="ml-auto tabular-nums text-fg">残り 4:12</span>
        </div>
        <div className="px-1 pt-6 pb-2 sm:px-3">
          <PassageReader
            blocks={DEMO_BLOCKS}
            fontSize="sm"
            glossary={DEMO_GLOSSARY}
            translatedBlocks={translatedBlocks}
            onLookupDictionary={lookUpDemoDictionary}
            onToggleTranslation={(blockIndex) => {
              setTranslatedBlocks((value) => {
                const next = new Set(value)
                if (next.has(blockIndex)) next.delete(blockIndex)
                else next.add(blockIndex)
                return next
              })
            }}
            onWordCardOpenChange={setIsWordCardOpen}
          />
        </div>
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-fg-muted">
          単語をクリックすると、この文での意味が出ます。段落番号の下の「訳」で和訳に切り替わります。
        </p>
        <span aria-hidden className={TILT_GLARE_CLASS} />
      </div>
    </div>
  )
}
