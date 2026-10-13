import { createHash } from "node:crypto"

import type { PassageBlock } from "@repo/domain"

import { AUDIO_TEXT_VERSION } from "../../const/audio"

import { listReadAloudBlocks } from "./read-aloud-blocks"

/**
 * 読み上げる本文と voice のハッシュ（passage_audios.text_hash。保存キーにも入る）。
 * 読み上げるブロックの [blockIndex, text]・AUDIO_TEXT_VERSION・voiceId の JSON の SHA-256（hex）なので、
 * 和訳と code のブロックの変更では変わらない。voice を含めるのは、声を変えたときに保存キーを変え、CDN の長期キャッシュに古い声が残らないようにするため
 */
export const calculateAudioTextHash = (input: { blocks: PassageBlock[]; voiceId: string }): string => {
  const payload = JSON.stringify({
    blocks: listReadAloudBlocks(input.blocks).map((block) => [block.blockIndex, block.text]),
    version: AUDIO_TEXT_VERSION,
    voiceId: input.voiceId,
  })
  return createHash("sha256").update(payload).digest("hex")
}
