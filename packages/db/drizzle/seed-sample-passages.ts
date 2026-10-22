/* eslint-disable no-console */
import { createHash } from "node:crypto"

import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm"

import {
  calculateTimeLimitSeconds,
  findSurfaceRange,
  hasQuote,
  type PassageBlock,
  type PassageStatus,
  QUESTION_CHOICE_COUNT,
  type QuestionType,
  type TagColor,
} from "@repo/domain"

import { createDrizzleClient, type DrizzleTransaction } from "../src/drizzle/client"
import {
  passageGlossaryEntries,
  passages,
  questions,
  sourceDocuments,
  sources,
  sourceTags,
  tags,
} from "../src/drizzle/schema"

/**
 * 開発用のサンプル問題を投入する（admin の問題の確認・公開と、reading-practice の画面をローカルで確かめるため）。
 *
 * - 本文・設問・用語集・和訳は web のモック（apps/web/src/libs/mock-data.ts）のダミーデータ。英文はモック用に書いたもので
 *   実在の文書の引用ではないため、ソースはこのリポジトリ自身（開発用サンプル）にしている
 * - ソース 1 件（収集で GitHub を呼ばないよう無効。タグ react / frontend つき）・取得文書 1 件と、問題 3 件（公開 1 件・下書き 2 件）を入れる
 *   - 公開：本文全体（7 ブロック・4 問・用語集 10 語）。reading-practice で解く用
 *   - 下書き（Part 1）：前半 5 ブロック・3 問。要確認の印つきで、公開の条件は満たす
 *   - 下書き（Part 2）：後半 2 ブロック・1 問。設問数と和訳が足りず、公開すると 400 になる
 * - 何度流しても同じ結果になる。ソース・取得文書・タグ（名前の大文字・小文字を区別しない）は既存を使い、問題は content_hash で upsert して状態・内容を初期値に戻す。
 *   用語集は消して入れ直し、設問は (passage_id, order_index) で upsert して余分な設問を消す（挑戦が指す設問の id は変わらない）
 * - 挑戦の記録は消さない。サンプルの範囲外の設問に回答がある場合は、設問を消せずに失敗する
 * - NODE_ENV=production では実行できない
 */

type SampleGlossaryItem = {
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa: string | null
  partOfSpeech: string
  surface: string
}

type SampleQuestion = {
  choices: string[]
  /**
   * vocabulary は null
   */
  choicesJa: string[] | null
  correctChoiceIndex: number
  evidence: { blockIndex: number; quote: string }
  explanationJa: string
  prompt: string
  promptJa: string
  /**
   * vocabulary のときだけ。同じ問題の用語集の surface
   */
  targetSurface: string | null
  type: QuestionType
  verificationChoiceIndex: number | null
}

type SamplePassage = {
  attentionReasons: string[]
  blocks: PassageBlock[]
  glossary: SampleGlossaryItem[]
  publishedAt: Date | null
  questions: SampleQuestion[]
  reviewedAt: Date | null
  status: PassageStatus
  title: string
  updatedAt: Date
}

const SOURCE = {
  branch: "main",
  excludeGlobs: [],
  fetchType: "github_repository" as const,
  includeGlobs: ["docs/sample/**/*.md"],
  /**
   * サンプル用なので収集の対象にしない（cron の collect:passages が GitHub を呼ばないように）
   */
  isEnabled: false,
  kind: "docs" as const,
  licenseSpdx: "CC-BY-4.0" as const,
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  name: "開発用サンプル",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: "kentakki416/tech-english",
}

/**
 * サンプルのソースに付けるタグ。admin で同じ名前（大文字・小文字を区別しない）のタグを作っていれば、そちらを使う
 */
const SOURCE_TAGS: { color: TagColor; name: string }[] = [
  { color: "blue", name: "react" },
  { color: "rose", name: "frontend" },
]

const DOCUMENT_PATH = "docs/sample/synchronizing-with-effects.md"

const RETRIEVED_AT = new Date("2026-10-10T03:00:00.000Z")
const GENERATED_AT = new Date("2026-10-11T03:00:00.000Z")
const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

/**
 * 生成の記録。LLM の出力ではないことが分かる値にする
 */
const GENERATION_MODEL = "sample-seed"
const GENERATION_PROMPT_VERSION = "sample-seed"

const BLOCKS: PassageBlock[] = [
  {
    text: "Synchronizing with Effects",
    translationJa: "エフェクトによる同期",
    type: "heading",
  },
  {
    text: "Some components need to stay in sync with systems that live outside of React, such as a browser API, a third-party widget, or a network connection. Effects let you run code after rendering so that you can synchronize your component with those systems. They are an escape hatch: you use them to step outside of React's rendering model when there is no other way to express what you need.",
    translationJa: "コンポーネントの中には、ブラウザの API、サードパーティのウィジェット、ネットワーク接続など、React の外にあるシステムと同期し続ける必要があるものがあります。エフェクトを使うと、レンダー後にコードを実行して、コンポーネントをそれらのシステムと同期させられます。エフェクトは「避難口」です。必要なことを他の方法で表現できないときに、React のレンダーの仕組みの外に出るために使います。",
    type: "paragraph",
  },
  {
    text: "Before reaching for an Effect, ask yourself whether the code is caused by rendering or by a specific interaction. If a piece of logic runs because the user clicked a button, it belongs in an event handler, not in an Effect. Event handlers know exactly what happened; Effects only know that the component has rendered. Mixing the two often leads to code that runs more often than intended.",
    translationJa: "エフェクトを使おうとする前に、そのコードがレンダーによって起きるのか、特定の操作によって起きるのかを考えてください。ユーザーがボタンをクリックしたために実行されるロジックなら、それはエフェクトではなくイベントハンドラに書くべきです。イベントハンドラは何が起きたかを正確に知っていますが、エフェクトが知っているのはコンポーネントがレンダーされたことだけです。両者を混ぜると、意図したより多く実行されるコードになりがちです。",
    type: "paragraph",
  },
  {
    text: "A common mistake is to use an Effect to keep one piece of state in sync with another. For example, storing `fullName` in state and updating it whenever `firstName` or `lastName` changes adds an extra render and makes the data flow harder to follow. Because the value can be derived from existing props or state, you can simply calculate it during rendering:",
    translationJa: "よくある間違いは、ある state を別の state と同期させ続けるためにエフェクトを使うことです。たとえば `fullName` を state に保存し、`firstName` か `lastName` が変わるたびに更新すると、余分なレンダーが 1 回増え、データの流れも追いにくくなります。この値は既存の props や state から導き出せるので、レンダー中に計算するだけで済みます。",
    type: "paragraph",
  },
  {
    lang: "jsx",
    text: "function Form() {\n  const [firstName, setFirstName] = useState(\"Ada\")\n  const [lastName, setLastName] = useState(\"Lovelace\")\n  // Good: calculated during rendering\n  const fullName = firstName + \" \" + lastName\n  // ...\n}",
    type: "code",
  },
  {
    text: "When you do need an Effect, React runs it after every render by default. In most cases, that is more often than necessary. You can opt out of re-running it by specifying a dependency array, which tells React to skip the Effect unless one of the listed values has changed. Under the hood, React compares each dependency with its previous value using `Object.is`.",
    translationJa: "エフェクトが本当に必要な場合、React はデフォルトで毎回のレンダー後にそれを実行します。ほとんどの場合、それは必要以上に頻繁です。依存配列を指定すると再実行をやめられます。依存配列は、列挙した値のどれかが変わらない限りエフェクトをスキップするよう React に伝えます。内部では、React は各依存値を前回の値と `Object.is` で比較しています。",
    type: "paragraph",
  },
  {
    text: "There is one caveat. In development, React intentionally mounts your component twice to help you find Effects that are missing a cleanup function. If your Effect connects to a server, it should also disconnect from it; otherwise, you may end up with two open connections. Writing the cleanup function is usually less work than it sounds, and it makes your component resilient to being shown, hidden, and shown again.",
    translationJa: "注意点が 1 つあります。開発環境では、クリーンアップ関数が欠けているエフェクトを見つけやすくするために、React は意図的にコンポーネントを 2 回マウントします。エフェクトがサーバーに接続するなら、切断もすべきです。そうしないと、接続が 2 つ開いたままになるかもしれません。クリーンアップ関数を書くのは思ったほど手間ではなく、コンポーネントを表示・非表示・再表示に強いものにしてくれます。",
    type: "paragraph",
  },
]

/**
 * 用語集（blockIndex は BLOCKS の index）
 */
const GLOSSARY: SampleGlossaryItem[] = [
  { blockIndex: 1, lemma: "stay in sync with", meaningJa: "〜と同期した状態を保つ", noteJa: null, partOfSpeech: "熟語", surface: "stay in sync with" },
  {
    blockIndex: 1,
    lemma: "escape hatch",
    meaningJa: "（通常の仕組みから）必要なときに抜け出すための手段",
    noteJa: "技術文書では、抽象化の外にある低レベルな機能を使うための「逃げ道」を指すことが多い。",
    partOfSpeech: "名詞",
    surface: "escape hatch",
  },
  { blockIndex: 1, lemma: "step outside of", meaningJa: "〜の外に出る、〜の枠組みから外れる", noteJa: null, partOfSpeech: "熟語", surface: "step outside of" },
  {
    blockIndex: 2,
    lemma: "reach for",
    meaningJa: "（解決策として）〜を使おうとする",
    noteJa: "「手を伸ばす」から転じて、ある道具や手段に頼ろうとすることを表す。",
    partOfSpeech: "熟語",
    surface: "reaching for",
  },
  {
    blockIndex: 3,
    lemma: "derive",
    meaningJa: "（既存の値から）導き出す、算出する",
    noteJa: "derived state（派生した状態）はフロントエンドの文書で頻出。",
    partOfSpeech: "動詞",
    surface: "derived",
  },
  {
    blockIndex: 5,
    lemma: "opt out of",
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    noteJa: "対になるのは opt in（自分で選んで有効にする）。",
    partOfSpeech: "熟語",
    surface: "opt out of",
  },
  {
    blockIndex: 5,
    lemma: "under the hood",
    meaningJa: "内部では、仕組みとしては",
    noteJa: "車のボンネット（hood）の下、つまり外から見えない内部の仕組みのこと。",
    partOfSpeech: "熟語",
    surface: "Under the hood",
  },
  { blockIndex: 6, lemma: "caveat", meaningJa: "注意点、但し書き", noteJa: null, partOfSpeech: "名詞", surface: "caveat" },
  { blockIndex: 6, lemma: "intentionally", meaningJa: "意図的に、わざと", noteJa: null, partOfSpeech: "副詞", surface: "intentionally" },
  { blockIndex: 6, lemma: "resilient", meaningJa: "（変化や障害に）強い、すぐに元に戻れる", noteJa: null, partOfSpeech: "形容詞", surface: "resilient" },
]

/**
 * 設問（evidence.blockIndex は BLOCKS の index）
 */
const QUESTION_MAIN_IDEA: SampleQuestion = {
  choices: [
    "To explain how React compares dependencies internally",
    "To describe when Effects are appropriate and how to use them correctly",
    "To argue that Effects should never be used in React components",
    "To introduce third-party widgets that work well with React",
  ],
  choicesJa: [
    "React が依存配列を内部でどう比べるかを説明するため",
    "エフェクトが適している場面と、正しい使い方を説明するため",
    "React のコンポーネントでエフェクトを決して使うべきでないと主張するため",
    "React とうまく連携するサードパーティのウィジェットを紹介するため",
  ],
  correctChoiceIndex: 1,
  evidence: { blockIndex: 1, quote: "Effects let you run code after rendering so that you can synchronize your component with those systems." },
  explanationJa: "本文は、エフェクトが外部のシステムと同期するための手段であること（第 1 段落）、イベントハンドラや計算で済む場合は使わないこと（第 2・3 段落）、使う場合の依存配列とクリーンアップ（第 4・5 段落）を順に説明しています。A は第 4 段落の一部の話題にすぎず、C は「使うべきでない」とまでは述べていないため誤りです。",
  prompt: "What is the main purpose of this passage?",
  promptJa: "この文章の主な目的は何か。",
  targetSurface: null,
  type: "main_idea",
  verificationChoiceIndex: 1,
}

const QUESTION_DETAIL: SampleQuestion = {
  choices: [
    "In an Effect with an empty dependency array",
    "In the cleanup function of an Effect",
    "In an event handler",
    "In a separate state variable",
  ],
  choicesJa: [
    "依存配列が空のエフェクトの中",
    "エフェクトのクリーンアップ関数の中",
    "イベントハンドラの中",
    "別の state 変数の中",
  ],
  correctChoiceIndex: 2,
  evidence: { blockIndex: 2, quote: "it belongs in an event handler, not in an Effect" },
  explanationJa: "第 2 段落に「ユーザーがボタンをクリックしたために実行されるロジックなら、エフェクトではなくイベントハンドラに書くべき」とあります。A と B はエフェクトの中に書く方法で、本文の主張と逆です。",
  prompt: "According to the passage, where should logic that runs because the user clicked a button be placed?",
  promptJa: "本文によると、ユーザーがボタンをクリックしたために実行されるロジックはどこに置くべきか。",
  targetSurface: null,
  type: "detail",
  verificationChoiceIndex: 2,
}

const QUESTION_VOCABULARY: SampleQuestion = {
  choices: [
    "a security vulnerability",
    "a way to leave the usual system when it is needed",
    "a shortcut that improves performance",
    "a feature that is no longer recommended",
  ],
  choicesJa: null,
  correctChoiceIndex: 1,
  evidence: { blockIndex: 1, quote: "They are an escape hatch: you use them to step outside of React's rendering model" },
  explanationJa: "escape hatch は直訳すると「脱出用のハッチ」です。直後に「React のレンダーの仕組みの外に出るために使う」と続いており、通常の仕組みから必要なときだけ抜け出す手段を指しています。C の「性能を上げる近道」は本文に無い意味です。",
  prompt: "In paragraph 1, the phrase \"escape hatch\" is closest in meaning to",
  promptJa: "第 1 段落の \"escape hatch\" に最も意味が近いものはどれか。",
  targetSurface: "escape hatch",
  type: "vocabulary",
  verificationChoiceIndex: 1,
}

const QUESTION_INFERENCE: SampleQuestion = {
  choices: [
    "To measure how long each render takes",
    "To make Effects run faster in production",
    "To reveal Effects that do not clean up after themselves",
    "To keep state in sync across components",
  ],
  choicesJa: [
    "各レンダーにかかる時間を測るため",
    "本番環境でエフェクトを速く動かすため",
    "後片付けをしないエフェクトを見つけ出すため",
    "コンポーネント間で state を同期させるため",
  ],
  correctChoiceIndex: 2,
  evidence: { blockIndex: 6, quote: "React intentionally mounts your component twice to help you find Effects that are missing a cleanup function" },
  explanationJa: "第 5 段落に「クリーンアップ関数が欠けているエフェクトを見つけやすくするために、React は意図的にコンポーネントを 2 回マウントする」とあります。A・B のような性能面の理由は述べられていません。",
  prompt: "Why does React mount components twice in development?",
  promptJa: "開発中に React がコンポーネントを 2 回マウントするのはなぜか。",
  targetSurface: null,
  type: "inference",
  verificationChoiceIndex: 2,
}

/**
 * BLOCKS の [start, end) を切り出した問題の内容（ブロックの位置を切り出した先頭からの index に直す）
 */
const sliceSampleContent = (start: number, end: number, sampleQuestions: SampleQuestion[]) => ({
  blocks: BLOCKS.slice(start, end),
  glossary: GLOSSARY
    .filter((item) => item.blockIndex >= start && item.blockIndex < end)
    .map((item) => ({ ...item, blockIndex: item.blockIndex - start })),
  questions: sampleQuestions.map((question) => ({
    ...question,
    evidence: { ...question.evidence, blockIndex: question.evidence.blockIndex - start },
  })),
})

const part2 = sliceSampleContent(5, 7, [QUESTION_INFERENCE])

const SAMPLE_PASSAGES: SamplePassage[] = [
  {
    ...sliceSampleContent(0, BLOCKS.length, [QUESTION_MAIN_IDEA, QUESTION_DETAIL, QUESTION_VOCABULARY, QUESTION_INFERENCE]),
    attentionReasons: [],
    publishedAt: PUBLISHED_AT,
    reviewedAt: PUBLISHED_AT,
    status: "published",
    title: "Synchronizing with Effects",
    updatedAt: PUBLISHED_AT,
  },
  {
    ...sliceSampleContent(0, 5, [
      {
        ...QUESTION_MAIN_IDEA,
        explanationJa: "本文は、エフェクトが外部のシステムと同期するための手段であること（第 1 段落）と、イベントハンドラや計算で済む場合は使わないこと（第 2・3 段落）を説明しています。A は本文で触れていない話題で、C は「使うべきでない」とまでは述べていないため誤りです。",
      },
      QUESTION_DETAIL,
      { ...QUESTION_VOCABULARY, verificationChoiceIndex: 0 },
    ]),
    attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
    publishedAt: null,
    reviewedAt: null,
    status: "draft",
    title: "Synchronizing with Effects — Part 1",
    updatedAt: new Date("2026-10-11T03:10:00.000Z"),
  },
  {
    ...part2,
    /**
     * 段落 2 の和訳を外し、公開の条件を満たさない下書きにする（設問も 1 問しかない）
     */
    blocks: part2.blocks.map((block, index) => (index === 1 ? { text: block.text, type: block.type } : block)),
    attentionReasons: ["段落 2 の和訳がありません"],
    publishedAt: null,
    reviewedAt: null,
    status: "draft",
    title: "Synchronizing with Effects — Part 2",
    updatedAt: new Date("2026-10-11T03:20:00.000Z"),
  },
]

const INLINE_CODE_PATTERN = /`[^`]*`/g

const WORD_CHARACTER_PATTERN = /[A-Za-z0-9]/

/**
 * 英単語数（cron の countEnglishWords と同じ数え方：code のブロックとインラインコードを除き、英数字を含むトークンを数える）
 */
const countEnglishWords = (blocks: PassageBlock[]): number =>
  blocks
    .filter((block) => block.type !== "code")
    .map((block) => block.text.replace(INLINE_CODE_PATTERN, " "))
    .reduce((sum, text) => sum + text.split(/\s+/).filter((token) => WORD_CHARACTER_PATTERN.test(token)).length, 0)

/**
 * 本文の正規化テキストの SHA-256（cron の calculateContentHash と同じ）
 */
const calculateContentHash = (blocks: PassageBlock[]): string => {
  const normalized = blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
  return createHash("sha256").update(normalized).digest("hex")
}

/**
 * 用語集の位置を本文から求める。見つからなければサンプルの誤りなので throw する
 */
const locateGlossaryItem = (sample: SamplePassage, item: SampleGlossaryItem): { endOffset: number; startOffset: number } => {
  const block = sample.blocks[item.blockIndex]
  const range = block && block.type !== "code" ? findSurfaceRange(block.text, item.surface) : null
  if (!range) throw new Error(`Glossary surface not found: ${sample.title} / ${item.surface}`)
  return range
}

/**
 * 設問の制約（4 択・空と重複なし・正解の位置・根拠の引用が本文にある・語義設問の対象が用語集にある）を確かめる。
 * 満たさなければサンプルの誤りなので throw する（公開の条件のうち、設問数と和訳はサンプルで意図して外すので見ない）
 */
const verifySampleQuestions = (sample: SamplePassage): void => {
  sample.questions.forEach((question, index) => {
    const label = `${sample.title} / Q${index + 1}`
    const normalizedChoices = question.choices.map((choice) => choice.trim().toLowerCase())
    if (
      question.choices.length !== QUESTION_CHOICE_COUNT
      || normalizedChoices.some((choice) => choice.length === 0)
      || new Set(normalizedChoices).size !== normalizedChoices.length
    ) {
      throw new Error(`Invalid choices: ${label}`)
    }
    if (question.correctChoiceIndex < 0 || question.correctChoiceIndex >= QUESTION_CHOICE_COUNT) {
      throw new Error(`Invalid correct choice: ${label}`)
    }
    const evidenceBlock = sample.blocks[question.evidence.blockIndex]
    if (!evidenceBlock || !hasQuote(evidenceBlock.text, question.evidence.quote)) throw new Error(`Evidence not found: ${label}`)
    if ((question.type === "vocabulary") !== (question.targetSurface !== null)) throw new Error(`Invalid vocabulary target: ${label}`)
    if (question.promptJa.trim().length === 0) throw new Error(`Missing prompt translation: ${label}`)
    const hasChoiceTranslations = question.choicesJa !== null
      && question.choicesJa.length === QUESTION_CHOICE_COUNT
      && question.choicesJa.every((choice) => choice.trim().length > 0)
    if (question.type === "vocabulary" ? question.choicesJa !== null : !hasChoiceTranslations) {
      throw new Error(`Invalid choice translations: ${label}`)
    }
    if (question.targetSurface !== null && !sample.glossary.some((item) => item.surface === question.targetSurface)) {
      throw new Error(`Vocabulary target is not in the glossary: ${label}`)
    }
  })
}

const db = createDrizzleClient()

/**
 * サンプルのソースにタグを付ける。tags は lower(name) の unique index に当たれば何もしない（既存のタグを使う）。
 * onConflictDoNothing に target を付けないのは、lower(name) が式の index で列を target に書けないため
 */
const ensureSourceTags = async (tx: DrizzleTransaction, sourceId: number): Promise<void> => {
  await tx.insert(tags).values(SOURCE_TAGS).onConflictDoNothing()
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(sql`lower(${tags.name})`, SOURCE_TAGS.map((tag) => tag.name.toLowerCase())))
  await tx
    .insert(sourceTags)
    .values(rows.map((row) => ({ sourceId: sourceId, tagId: row.id })))
    .onConflictDoNothing()
}

/**
 * ソースと取得文書は既存があればそれを使う（admin から同じリポジトリを登録していても壊さない）
 */
const ensureSourceDocument = async (tx: DrizzleTransaction): Promise<number> => {
  await tx.insert(sources).values(SOURCE).onConflictDoNothing({ target: sources.repository })
  const [source] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.repository, SOURCE.repository))
  if (!source) throw new Error(`Failed to find source: ${SOURCE.repository}`)
  await ensureSourceTags(tx, source.id)

  await tx
    .insert(sourceDocuments)
    .values({ fetchedAt: RETRIEVED_AT, path: DOCUMENT_PATH, sourceId: source.id, title: "Synchronizing with Effects" })
    .onConflictDoNothing({ target: [sourceDocuments.sourceId, sourceDocuments.path] })
  const [document] = await tx
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.sourceId, source.id), eq(sourceDocuments.path, DOCUMENT_PATH)))
  if (!document) throw new Error(`Failed to find source document: ${DOCUMENT_PATH}`)
  return document.id
}

const seedSamplePassages = async (): Promise<void> => {
  for (const sample of SAMPLE_PASSAGES) verifySampleQuestions(sample)

  await db.transaction(async (tx) => {
    const sourceDocumentId = await ensureSourceDocument(tx)

    for (const sample of SAMPLE_PASSAGES) {
      const wordCount = countEnglishWords(sample.blocks)
      const values = {
        attentionReasons: sample.attentionReasons,
        blocks: sample.blocks,
        difficulty: 2 as const,
        generatedAt: GENERATED_AT,
        generationAttemptCount: 0,
        generationError: null,
        generationModel: GENERATION_MODEL,
        generationPromptVersion: GENERATION_PROMPT_VERSION,
        generationStartedAt: GENERATED_AT,
        needsAttention: sample.attentionReasons.length > 0,
        publishedAt: sample.publishedAt,
        rejectReason: null,
        reviewedAt: sample.reviewedAt,
        sourceCommitSha: null,
        sourceDocumentId,
        sourcePath: DOCUMENT_PATH,
        sourceRetrievedAt: RETRIEVED_AT,
        status: sample.status,
        timeLimitSeconds: calculateTimeLimitSeconds(wordCount, 2, sample.questions.length),
        title: sample.title,
        wordCount,
        updatedAt: sample.updatedAt,
      }
      const [passage] = await tx
        .insert(passages)
        .values({ ...values, contentHash: calculateContentHash(sample.blocks) })
        .onConflictDoUpdate({ set: values, target: passages.contentHash })
        .returning({ id: passages.id })
      if (!passage) throw new Error(`Failed to upsert passage: ${sample.title}`)

      /**
       * 用語集は消して入れ直す（設問の対象と調べた単語の紐づけは ON DELETE SET NULL で外れ、下で付け直す）
       */
      await tx.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, passage.id))
      const glossaryIdBySurface = new Map<string, number>()
      for (const item of sample.glossary) {
        const [entry] = await tx
          .insert(passageGlossaryEntries)
          .values({ ...item, ...locateGlossaryItem(sample, item), passageId: passage.id })
          .returning({ id: passageGlossaryEntries.id })
        if (!entry) throw new Error(`Failed to insert glossary entry: ${item.surface}`)
        glossaryIdBySurface.set(item.surface, entry.id)
      }

      /**
       * 設問は order_index で upsert し、サンプルに無い order_index（admin で足した設問・並べ替えで退避した負の値）を消す
       */
      await tx
        .delete(questions)
        .where(and(eq(questions.passageId, passage.id), or(lt(questions.orderIndex, 0), gte(questions.orderIndex, sample.questions.length))))
      for (const [orderIndex, question] of sample.questions.entries()) {
        const questionValues = {
          choices: question.choices,
          choicesJa: question.choicesJa,
          correctChoiceIndex: question.correctChoiceIndex,
          evidenceBlockIndex: question.evidence.blockIndex,
          evidenceQuote: question.evidence.quote,
          explanationJa: question.explanationJa,
          prompt: question.prompt,
          promptJa: question.promptJa,
          targetGlossaryEntryId: question.targetSurface === null ? null : glossaryIdBySurface.get(question.targetSurface) ?? null,
          type: question.type,
          verificationChoiceIndex: question.verificationChoiceIndex,
        }
        await tx
          .insert(questions)
          .values({ ...questionValues, orderIndex, passageId: passage.id })
          .onConflictDoUpdate({ set: questionValues, target: [questions.passageId, questions.orderIndex] })
      }

      console.log(
        `Seeded sample passage: ${sample.title} (id=${passage.id}, status=${sample.status}, words=${wordCount}, questions=${sample.questions.length}, glossary=${sample.glossary.length})`,
      )
    }
  })
}

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Refuse to seed sample passages: NODE_ENV=production")
    process.exitCode = 1
    return
  }
  await seedSamplePassages()
  console.log("Sample passages seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
