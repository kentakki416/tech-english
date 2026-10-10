/**
 * 本文の部品（PassageReader）が受け取る表示用の型。API のレスポンス型ではない
 */
export type ReaderBlockType = "code" | "heading" | "list_item" | "paragraph" | "quote"

export type ReaderBlock = {
  lang?: string
  text: string
  translationJa?: string
  type: ReaderBlockType
}

export type ReaderGlossaryEntry = {
  id: number
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa?: string
  partOfSpeech: string
  surface: string
}

export type ReaderWordLookup = {
  meaningJa: string
  source: "dictionary" | "glossary"
  surface: string
}
