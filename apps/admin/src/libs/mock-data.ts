/**
 * admin のデザインモック（/mock 配下）用のダミーデータ
 *
 * API を呼ばずに画面を表現するためのハードコード値。本実装では `@repo/api-schema/admin/` の
 * レスポンス型に置き換わる。ソースの CSS セレクタや sitemap の URL は実在のサイトを確認した値ではない。
 */

export type AdminSourceKind = "docs" | "github"

export type AdminFetchType = "github_repository" | "website"

export type AdminPassageStatus = "collected" | "draft" | "failed" | "generating" | "published" | "rejected"

export type AdminContentSource = {
  id: number
  branch?: string
  contentSelector?: string
  excludeGlobs: string[]
  excludeSelectors?: string[]
  failedPages?: { httpStatus: number, path: string }[]
  fetchType: AdminFetchType
  includeGlobs: string[]
  isEnabled: boolean
  kind: AdminSourceKind
  lastCollectedAt: string | null
  lastCollectedCommitSha?: string
  licenseSpdx: string
  licenseUrl: string
  name: string
  origin: string
  passageCounts: { collected: number, draft: number, published: number, rejected: number }
  publicUrlStripPrefix?: string
  publicUrlTemplate?: string
  sitemapUrl?: string
  startUrl?: string
  tags: string[]
}

export const ALLOWED_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC-BY-4.0",
  "PSF-2.0",
  "CC0-1.0",
  "Unlicense",
]

export const MOCK_SOURCES: AdminContentSource[] = [
  {
    id: 1,
    branch: "main",
    excludeGlobs: [],
    fetchType: "github_repository",
    includeGlobs: ["src/content/learn/**/*.md"],
    isEnabled: true,
    kind: "docs",
    lastCollectedAt: "2026-10-10 03:00",
    lastCollectedCommitSha: "3f9c2a1",
    licenseSpdx: "CC-BY-4.0",
    licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
    name: "React 公式ドキュメント",
    origin: "reactjs/react.dev",
    passageCounts: { collected: 12, draft: 6, published: 48, rejected: 5 },
    publicUrlStripPrefix: "src/content/",
    publicUrlTemplate: "https://react.dev/{path}",
    tags: ["react", "frontend"],
  },
  {
    id: 2,
    branch: "main",
    excludeGlobs: ["**/_index.md"],
    fetchType: "github_repository",
    includeGlobs: ["content/en/docs/concepts/**/*.md"],
    isEnabled: true,
    kind: "docs",
    lastCollectedAt: "2026-10-10 03:02",
    lastCollectedCommitSha: "a81d0e4",
    licenseSpdx: "CC-BY-4.0",
    licenseUrl: "https://github.com/kubernetes/website/blob/main/LICENSE",
    name: "Kubernetes ドキュメント",
    origin: "kubernetes/website",
    passageCounts: { collected: 31, draft: 4, published: 62, rejected: 9 },
    publicUrlStripPrefix: "content/en/",
    publicUrlTemplate: "https://kubernetes.io/{path}",
    tags: ["kubernetes", "infra"],
  },
  {
    id: 3,
    branch: "main",
    excludeGlobs: [],
    fetchType: "github_repository",
    includeGlobs: ["src/**/*.md"],
    isEnabled: true,
    kind: "docs",
    lastCollectedAt: "2026-10-10 03:05",
    lastCollectedCommitSha: "05c77b9",
    licenseSpdx: "MIT",
    licenseUrl: "https://github.com/rust-lang/book/blob/main/LICENSE-MIT",
    name: "The Rust Programming Language",
    origin: "rust-lang/book",
    passageCounts: { collected: 8, draft: 2, published: 41, rejected: 3 },
    tags: ["rust"],
  },
  {
    id: 4,
    branch: "master",
    excludeGlobs: [],
    fetchType: "github_repository",
    includeGlobs: ["text/**/*.md"],
    isEnabled: true,
    kind: "github",
    lastCollectedAt: "2026-10-10 03:06",
    lastCollectedCommitSha: "c2e9f10",
    licenseSpdx: "MIT",
    licenseUrl: "https://github.com/rust-lang/rfcs/blob/master/LICENSE-MIT",
    name: "Rust RFCs",
    origin: "rust-lang/rfcs",
    passageCounts: { collected: 40, draft: 2, published: 22, rejected: 11 },
    tags: ["rust"],
  },
  {
    id: 5,
    contentSelector: "main",
    excludeGlobs: ["/doc/devel/**"],
    excludeSelectors: [".Breadcrumb", ".Article-footer"],
    failedPages: [
      { httpStatus: 404, path: "/doc/articles/go_command.html" },
      { httpStatus: 404, path: "/doc/gdb" },
    ],
    fetchType: "website",
    includeGlobs: ["/doc/**"],
    isEnabled: true,
    kind: "docs",
    lastCollectedAt: "2026-10-10 03:11",
    licenseSpdx: "CC-BY-4.0",
    licenseUrl: "https://go.dev/copyright",
    name: "Go 公式ドキュメント",
    origin: "https://go.dev",
    passageCounts: { collected: 18, draft: 0, published: 27, rejected: 4 },
    startUrl: "https://go.dev/doc/",
    tags: ["go", "backend"],
  },
  {
    id: 6,
    contentSelector: "div.body",
    excludeGlobs: [],
    excludeSelectors: [],
    failedPages: [],
    fetchType: "website",
    includeGlobs: ["/3/tutorial/**", "/3/howto/**"],
    isEnabled: false,
    kind: "docs",
    lastCollectedAt: null,
    licenseSpdx: "PSF-2.0",
    licenseUrl: "https://docs.python.org/3/license.html",
    name: "Python ドキュメント",
    origin: "https://docs.python.org",
    passageCounts: { collected: 0, draft: 0, published: 0, rejected: 0 },
    startUrl: "https://docs.python.org/3/tutorial/",
    tags: ["python"],
  },
  {
    id: 7,
    contentSelector: "article.devsite-article",
    excludeGlobs: [],
    excludeSelectors: [".devsite-article-meta", "devsite-feedback"],
    failedPages: [
      { httpStatus: 404, path: "/run/docs/legacy/overview" },
      { httpStatus: 410, path: "/run/docs/quickstarts/build-and-deploy/old" },
      { httpStatus: 404, path: "/run/docs/fit-for-run" },
    ],
    fetchType: "website",
    includeGlobs: ["/run/docs/**"],
    isEnabled: true,
    kind: "docs",
    lastCollectedAt: "2026-10-10 03:24",
    licenseSpdx: "CC-BY-4.0",
    licenseUrl: "https://cloud.google.com/site-policies",
    name: "Google Cloud ドキュメント",
    origin: "https://cloud.google.com",
    passageCounts: { collected: 9, draft: 2, published: 19, rejected: 2 },
    sitemapUrl: "https://cloud.google.com/sitemap.xml",
    tags: ["gcp", "infra"],
  },
]

export const PASSAGE_STATUS_LABELS: Record<AdminPassageStatus, string> = {
  collected: "収集済み",
  draft: "下書き",
  failed: "失敗",
  generating: "生成中",
  published: "公開",
  rejected: "却下",
}

export const MOCK_PASSAGE_STATUS_COUNTS: Record<AdminPassageStatus, number> = {
  collected: 118,
  draft: 16,
  failed: 3,
  generating: 2,
  published: 219,
  rejected: 34,
}

export type AdminPassageRow = {
  id: number
  attemptCount: number
  difficulty: 1 | 2 | 3 | null
  note: string[]
  questionCount: number | null
  sourceName: string
  status: AdminPassageStatus
  title: string
  updatedAt: string
  wordCount: number
}

export const MOCK_PASSAGE_ROWS: AdminPassageRow[] = [
  { id: 42, attemptCount: 0, difficulty: 2, note: ["Q3：検証モデルは A を選択（正解は B）"], questionCount: 4, sourceName: "React 公式ドキュメント", status: "draft", title: "Synchronizing with Effects", updatedAt: "2026-10-09 04:12", wordCount: 332 },
  { id: 88, attemptCount: 0, difficulty: 2, note: ["Q2 の根拠が本文に見つかりません", "段落 3 の和訳がありません"], questionCount: 4, sourceName: "Kubernetes ドキュメント", status: "draft", title: "Garbage Collection", updatedAt: "2026-10-09 04:15", wordCount: 411 },
  { id: 93, attemptCount: 0, difficulty: 2, note: [], questionCount: 4, sourceName: "Go 公式ドキュメント", status: "draft", title: "Defer, Panic, and Recover", updatedAt: "2026-10-08 04:03", wordCount: 389 },
  { id: 97, attemptCount: 0, difficulty: 1, note: [], questionCount: 3, sourceName: "The Rust Programming Language", status: "draft", title: "Recoverable Errors with Result", updatedAt: "2026-10-09 04:20", wordCount: 296 },
  { id: 101, attemptCount: 0, difficulty: 3, note: [], questionCount: 5, sourceName: "Rust RFCs", status: "draft", title: "RFC: Async closures", updatedAt: "2026-10-10 04:01", wordCount: 540 },
  { id: 57, attemptCount: 128, difficulty: 2, note: [], questionCount: 4, sourceName: "The Rust Programming Language", status: "published", title: "What Is Ownership?", updatedAt: "2026-09-28 10:31", wordCount: 418 },
  { id: 63, attemptCount: 94, difficulty: 2, note: [], questionCount: 4, sourceName: "Go 公式ドキュメント", status: "published", title: "Working with errors in Go", updatedAt: "2026-09-30 09:12", wordCount: 365 },
  { id: 75, attemptCount: 211, difficulty: 2, note: [], questionCount: 4, sourceName: "Kubernetes ドキュメント", status: "published", title: "Pod Lifecycle", updatedAt: "2026-09-21 18:40", wordCount: 402 },
  { id: 110, attemptCount: 0, difficulty: null, note: [], questionCount: null, sourceName: "Google Cloud ドキュメント", status: "collected", title: "Configuring CPU limits", updatedAt: "2026-10-10 03:24", wordCount: 318 },
  { id: 111, attemptCount: 0, difficulty: null, note: [], questionCount: null, sourceName: "Rust RFCs", status: "collected", title: "RFC: Let chains", updatedAt: "2026-10-10 03:06", wordCount: 502 },
  { id: 112, attemptCount: 0, difficulty: null, note: [], questionCount: null, sourceName: "React 公式ドキュメント", status: "generating", title: "Removing Effect Dependencies", updatedAt: "2026-10-10 04:30", wordCount: 455 },
  { id: 70, attemptCount: 0, difficulty: null, note: ["LLM 判定：目次とリンクだけで、読解の題材になる文章がない"], questionCount: null, sourceName: "Kubernetes ドキュメント", status: "rejected", title: "Concepts", updatedAt: "2026-10-07 04:10", wordCount: 214 },
  { id: 81, attemptCount: 0, difficulty: 3, note: ["管理者：コード例が中心で、本文が短すぎる"], questionCount: 5, sourceName: "Rust RFCs", status: "rejected", title: "RFC: Inline const", updatedAt: "2026-10-08 11:52", wordCount: 488 },
  { id: 104, attemptCount: 0, difficulty: null, note: ["出力の検証に 2 回不合格：設問数が 4 ではなく 3（3 回目）"], questionCount: null, sourceName: "Google Cloud ドキュメント", status: "failed", title: "Service identity", updatedAt: "2026-10-10 04:18", wordCount: 437 },
]

/**
 * ページ送りを見せるための追加の行（下書き 11 件・公開 19 件）
 */
const EXTRA_PASSAGES: { sourceName: string, title: string }[] = [
  { sourceName: "React 公式ドキュメント", title: "You Might Not Need an Effect" },
  { sourceName: "React 公式ドキュメント", title: "Preserving and Resetting State" },
  { sourceName: "Kubernetes ドキュメント", title: "Owners and Dependents" },
  { sourceName: "Kubernetes ドキュメント", title: "Init Containers" },
  { sourceName: "The Rust Programming Language", title: "Understanding Ownership" },
  { sourceName: "The Rust Programming Language", title: "Defining and Instantiating Structs" },
  { sourceName: "Rust RFCs", title: "RFC: Let chains" },
  { sourceName: "Go 公式ドキュメント", title: "Go Modules Reference" },
  { sourceName: "Go 公式ドキュメント", title: "Data Race Detector" },
  { sourceName: "Google Cloud ドキュメント", title: "Container runtime contract" },
  { sourceName: "Google Cloud ドキュメント", title: "Configuring memory limits" },
  { sourceName: "React 公式ドキュメント", title: "Thinking in React" },
  { sourceName: "React 公式ドキュメント", title: "Managing State" },
  { sourceName: "React 公式ドキュメント", title: "Referencing Values with Refs" },
  { sourceName: "Kubernetes ドキュメント", title: "Container Lifecycle Hooks" },
  { sourceName: "Kubernetes ドキュメント", title: "Service" },
  { sourceName: "Kubernetes ドキュメント", title: "ConfigMaps" },
  { sourceName: "The Rust Programming Language", title: "References and Borrowing" },
  { sourceName: "The Rust Programming Language", title: "The Slice Type" },
  { sourceName: "The Rust Programming Language", title: "Generic Data Types" },
  { sourceName: "Rust RFCs", title: "RFC: Never type fallback" },
  { sourceName: "Rust RFCs", title: "RFC: Trait upcasting" },
  { sourceName: "Go 公式ドキュメント", title: "Effective Go: Concurrency" },
  { sourceName: "Go 公式ドキュメント", title: "Profile-guided optimization" },
  { sourceName: "Go 公式ドキュメント", title: "Fuzzing" },
  { sourceName: "Google Cloud ドキュメント", title: "Deploying container images" },
  { sourceName: "Google Cloud ドキュメント", title: "Traffic splitting" },
  { sourceName: "Google Cloud ドキュメント", title: "Service accounts" },
  { sourceName: "React 公式ドキュメント", title: "Scaling Up with Reducer and Context" },
  { sourceName: "Kubernetes ドキュメント", title: "Horizontal Pod Autoscaling" },
]

MOCK_PASSAGE_ROWS.push(
  ...EXTRA_PASSAGES.map((passage, index): AdminPassageRow => {
    const isDraft = index < 11
    const day = String(28 - (index % 20)).padStart(2, "0")
    return {
      id: 200 + index,
      attemptCount: isDraft ? 0 : 12 + ((index * 37) % 180),
      difficulty: ((index % 3) + 1) as 1 | 2 | 3,
      note: isDraft && index === 4 ? ["用語集の 1 件が本文に見つからず除外されました"] : [],
      questionCount: 3 + (index % 3),
      sourceName: passage.sourceName,
      status: isDraft ? "draft" : "published",
      title: passage.title,
      updatedAt: isDraft ? `2026-10-0${(index % 8) + 1} 04:${String(10 + index).padStart(2, "0")}` : `2026-09-${day} 1${index % 10}:20`,
      wordCount: 240 + ((index * 53) % 360),
    }
  }),
)

export type AdminBlock = {
  lang?: string
  text: string
  translationJa?: string
  type: "code" | "heading" | "list_item" | "paragraph" | "quote"
}

export type AdminGlossaryEntry = {
  id: number
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa?: string
  partOfSpeech: string
  surface: string
}

export type AdminQuestion = {
  id: number
  choices: string[]
  correctChoiceIndex: number
  evidence: { blockIndex: number, quote: string }
  explanationJa: string
  prompt: string
  targetGlossaryEntryId?: number
  type: "detail" | "inference" | "main_idea" | "purpose" | "vocabulary"
  verificationChoiceIndex: number
}

export const QUESTION_TYPE_OPTIONS = [
  { label: "要旨", value: "main_idea" },
  { label: "詳細", value: "detail" },
  { label: "文脈での語義", value: "vocabulary" },
  { label: "推論", value: "inference" },
  { label: "筆者の意図", value: "purpose" },
]

/**
 * 問題の確認・修正画面で使う下書き（web のモックと同じ問題）
 */
export const MOCK_PASSAGE_DETAIL = {
  id: 42,
  attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
  difficulty: 2,
  generatedAt: "2026-10-09 04:12",
  generationModel: "claude-sonnet-5-5",
  generationPromptVersion: "2026-10-01",
  sourceCommitSha: "3f9c2a1",
  sourceName: "React 公式ドキュメント",
  sourcePath: "src/content/learn/synchronizing-with-effects.md",
  timeLimitSeconds: 330,
  title: "Synchronizing with Effects",
  wordCount: 332,
}

export const MOCK_BLOCKS: AdminBlock[] = [
  { text: "Synchronizing with Effects", translationJa: "エフェクトによる同期", type: "heading" },
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

export const MOCK_GLOSSARY: AdminGlossaryEntry[] = [
  { id: 1, blockIndex: 1, lemma: "stay in sync with", meaningJa: "〜と同期した状態を保つ", partOfSpeech: "熟語", surface: "stay in sync with" },
  { id: 2, blockIndex: 1, lemma: "escape hatch", meaningJa: "（通常の仕組みから）必要なときに抜け出すための手段", noteJa: "技術文書では、抽象化の外にある低レベルな機能を使うための「逃げ道」を指すことが多い。", partOfSpeech: "名詞", surface: "escape hatch" },
  { id: 3, blockIndex: 1, lemma: "step outside of", meaningJa: "〜の外に出る、〜の枠組みから外れる", partOfSpeech: "熟語", surface: "step outside of" },
  { id: 4, blockIndex: 2, lemma: "reach for", meaningJa: "（解決策として）〜を使おうとする", noteJa: "「手を伸ばす」から転じて、ある道具や手段に頼ろうとすることを表す。", partOfSpeech: "熟語", surface: "reaching for" },
  { id: 5, blockIndex: 3, lemma: "derive", meaningJa: "（既存の値から）導き出す、算出する", partOfSpeech: "動詞", surface: "derived" },
  { id: 6, blockIndex: 5, lemma: "opt out of", meaningJa: "〜をやめる、（既定の動作を）無効にする", noteJa: "対になるのは opt in（自分で選んで有効にする）。", partOfSpeech: "熟語", surface: "opt out of" },
  { id: 7, blockIndex: 5, lemma: "under the hood", meaningJa: "内部では、仕組みとしては", partOfSpeech: "熟語", surface: "Under the hood" },
  { id: 8, blockIndex: 6, lemma: "caveat", meaningJa: "注意点、但し書き", partOfSpeech: "名詞", surface: "caveat" },
  { id: 9, blockIndex: 6, lemma: "intentionally", meaningJa: "意図的に、わざと", partOfSpeech: "副詞", surface: "intentionally" },
  { id: 10, blockIndex: 6, lemma: "resilient", meaningJa: "（変化や障害に）強い、すぐに元に戻れる", partOfSpeech: "形容詞", surface: "resilient" },
]

export const MOCK_QUESTIONS: AdminQuestion[] = [
  {
    id: 1,
    choices: [
      "To explain how React compares dependencies internally",
      "To describe when Effects are appropriate and how to use them correctly",
      "To argue that Effects should never be used in React components",
      "To introduce third-party widgets that work well with React",
    ],
    correctChoiceIndex: 1,
    evidence: { blockIndex: 1, quote: "Effects let you run code after rendering so that you can synchronize your component with those systems." },
    explanationJa: "本文は、エフェクトが外部のシステムと同期するための手段であること（第 1 段落）、イベントハンドラや計算で済む場合は使わないこと（第 2・3 段落）、使う場合の依存配列とクリーンアップ（第 4・5 段落）を順に説明しています。",
    prompt: "What is the main purpose of this passage?",
    type: "main_idea",
    verificationChoiceIndex: 1,
  },
  {
    id: 2,
    choices: [
      "In an Effect with an empty dependency array",
      "In the cleanup function of an Effect",
      "In an event handler",
      "In a separate state variable",
    ],
    correctChoiceIndex: 2,
    evidence: { blockIndex: 2, quote: "it belongs in an event handler, not in an Effect" },
    explanationJa: "第 2 段落に「ユーザーがボタンをクリックしたために実行されるロジックなら、エフェクトではなくイベントハンドラに書くべき」とあります。",
    prompt: "According to the passage, where should logic that runs because the user clicked a button be placed?",
    type: "detail",
    verificationChoiceIndex: 2,
  },
  {
    id: 3,
    choices: [
      "a security vulnerability",
      "a way to leave the usual system when it is needed",
      "a shortcut that improves performance",
      "a feature that is no longer recommended",
    ],
    correctChoiceIndex: 1,
    evidence: { blockIndex: 1, quote: "They are an escape hatch: you use them to step outside of React's rendering model" },
    explanationJa: "escape hatch は直訳すると「脱出用のハッチ」です。直後に「React のレンダーの仕組みの外に出るために使う」と続いており、通常の仕組みから必要なときだけ抜け出す手段を指しています。",
    prompt: "In paragraph 1, the phrase \"escape hatch\" is closest in meaning to",
    targetGlossaryEntryId: 2,
    type: "vocabulary",
    verificationChoiceIndex: 0,
  },
  {
    id: 4,
    choices: [
      "To measure how long each render takes",
      "To make Effects run faster in production",
      "To reveal Effects that do not clean up after themselves",
      "To keep state in sync across components",
    ],
    correctChoiceIndex: 2,
    evidence: { blockIndex: 6, quote: "React intentionally mounts your component twice to help you find Effects that are missing a cleanup function" },
    explanationJa: "第 5 段落に「クリーンアップ関数が欠けているエフェクトを見つけやすくするために、React は意図的にコンポーネントを 2 回マウントする」とあります。",
    prompt: "Why does React mount components twice in development?",
    type: "inference",
    verificationChoiceIndex: 2,
  },
]

/**
 * 制限時間の計算式（question-generation spec）：英単語数 ÷ 想定 WPM × 60 ＋ 設問数 × 40 を 30 秒単位に切り上げ
 */
export const calculateTimeLimitSeconds = (wordCount: number, difficulty: 1 | 2 | 3, questionCount: number): number => {
  const wpm = { 1: 100, 2: 120, 3: 140 }[difficulty]
  const raw = (wordCount / wpm) * 60 + questionCount * 40
  return Math.ceil(raw / 30) * 30
}

export const formatSeconds = (totalSeconds: number): string =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`

// ========================================================
// ダッシュボード（admin-dashboard）
// ========================================================

export type AdminStatsPeriod = "30d" | "7d" | "all"

export const STATS_PERIOD_LABELS: Record<AdminStatsPeriod, string> = {
  "30d": "直近 30 日",
  "7d": "直近 7 日",
  all: "全期間",
}

/**
 * URL の ?period= を期間にする。不正・未指定は直近 30 日
 */
export const convertToStatsPeriod = (value: string | undefined): AdminStatsPeriod => (value === "7d" || value === "all" ? value : "30d")

export const DIFFICULTY_LABELS = { 1: "Easy", 2: "Normal", 3: "Hard" }

/**
 * アシストの利用率（解いたうち、和訳を開いた・単語を調べた・読み上げを聞いた割合）
 */
export type AssistRates = { listened: number | null, lookedUp: number | null, translated: number | null }

export type OverviewPoint = { activeUsers: number, date: string, newUsers: number, solvedAttempts: number }

export type MockOverview = {
  activeUsers: number
  assistRates: AssistRates
  bucket: "day" | "week"
  correctRate: number | null
  from: string
  newUsers: number
  points: OverviewPoint[]
  solvedAttempts: number
  solvedUsers: number
  to: string
  totalUsers: number
}

/**
 * 日付（YYYY-MM-DD）に日数を足す。モックの日付は 2026-10-15（木）を今日にする
 */
const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const MOCK_TODAY = "2026-10-15"

/**
 * 日ごとの推移。土日に少し下がる波にする
 */
const buildDailyPoints = (dayCount: number): OverviewPoint[] =>
  Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(MOCK_TODAY, index - dayCount + 1)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const isWeekend = weekday === 0 || weekday === 6
    const trend = Math.round((index / dayCount) * 18)
    return {
      activeUsers: 58 + trend + Math.round(9 * Math.sin(index / 1.7)) - (isWeekend ? 14 : 0),
      date,
      newUsers: 4 + ((index * 7) % 6) + (isWeekend ? 2 : 0),
      solvedAttempts: 84 + trend + Math.round(14 * Math.sin(index / 1.3)) - (isWeekend ? 22 : 0),
    }
  })

/**
 * 週ごとの推移（日本時間の月曜始まり）。サービス開始の 2026-04-06 の週から
 */
const buildWeeklyPoints = (): OverviewPoint[] =>
  Array.from({ length: 28 }, (_, index) => ({
    activeUsers: Math.round(40 + index * 12 + 10 * Math.sin(index / 2)),
    date: addDays("2026-04-06", index * 7),
    newUsers: Math.round(25 + index * 1.2 + 8 * Math.sin(index / 3)),
    solvedAttempts: Math.round(150 + index * 22 + 30 * Math.sin(index / 2.4)),
  }))

const sumPoints = (points: OverviewPoint[], key: "newUsers" | "solvedAttempts"): number =>
  points.reduce((total, point) => total + point[key], 0)

const DAILY_POINTS_30 = buildDailyPoints(30)
const DAILY_POINTS_7 = DAILY_POINTS_30.slice(-7)
const WEEKLY_POINTS = buildWeeklyPoints()

export const MOCK_OVERVIEWS: Record<AdminStatsPeriod, MockOverview> = {
  "30d": {
    activeUsers: 412,
    assistRates: { listened: 0.22, lookedUp: 0.61, translated: 0.34 },
    bucket: "day",
    correctRate: 0.72,
    from: DAILY_POINTS_30[0].date,
    newUsers: sumPoints(DAILY_POINTS_30, "newUsers"),
    points: DAILY_POINTS_30,
    solvedAttempts: sumPoints(DAILY_POINTS_30, "solvedAttempts"),
    solvedUsers: 356,
    to: MOCK_TODAY,
    totalUsers: 1284,
  },
  "7d": {
    activeUsers: 198,
    assistRates: { listened: 0.25, lookedUp: 0.59, translated: 0.31 },
    bucket: "day",
    correctRate: 0.74,
    from: DAILY_POINTS_7[0].date,
    newUsers: sumPoints(DAILY_POINTS_7, "newUsers"),
    points: DAILY_POINTS_7,
    solvedAttempts: sumPoints(DAILY_POINTS_7, "solvedAttempts"),
    solvedUsers: 171,
    to: MOCK_TODAY,
    totalUsers: 1284,
  },
  all: {
    activeUsers: 1031,
    assistRates: { listened: 0.18, lookedUp: 0.63, translated: 0.37 },
    bucket: "week",
    correctRate: 0.7,
    from: "2026-04-06",
    newUsers: 1284,
    points: WEEKLY_POINTS,
    solvedAttempts: sumPoints(WEEKLY_POINTS, "solvedAttempts"),
    solvedUsers: 958,
    to: MOCK_TODAY,
    totalUsers: 1284,
  },
}

/**
 * サービスを始めたばかりで、まだ誰も学習していない状態
 */
export const MOCK_EMPTY_OVERVIEW: MockOverview = {
  activeUsers: 0,
  assistRates: { listened: null, lookedUp: null, translated: null },
  bucket: "day",
  correctRate: null,
  from: DAILY_POINTS_30[0].date,
  newUsers: 0,
  points: DAILY_POINTS_30.map(point => ({ ...point, activeUsers: 0, newUsers: 0, solvedAttempts: 0 })),
  solvedAttempts: 0,
  solvedUsers: 0,
  to: MOCK_TODAY,
  totalUsers: 0,
}

export type PassageStatsRow = {
  id: number
  assistRates: AssistRates
  averageElapsedSeconds: number | null
  correctRate: number | null
  difficulty: 1 | 2 | 3
  overtimeRate: number | null
  publishedAt: string | null
  solvedAttempts: number
  solvedUsers: number
  sourceName: string
  status: AdminPassageStatus
  timeLimitSeconds: number
  title: string
}

/**
 * 問題ごとの成績のもと。期間ごとに、解いた回数の合計が数字のカードの解いた回数と同じになるよう増減させる。
 * 公開中の問題と、非公開に戻したが解かれた問題（Errors are values）
 */
const PASSAGE_STATS_BASE: PassageStatsRow[] = [
  {
    id: 57,
    assistRates: { listened: 0.18, lookedUp: 0.66, translated: 0.41 },
    averageElapsedSeconds: 312,
    correctRate: 0.56,
    difficulty: 2,
    overtimeRate: 0.21,
    publishedAt: "2026-09-28",
    solvedAttempts: 214,
    solvedUsers: 168,
    sourceName: "The Rust Programming Language",
    status: "published",
    timeLimitSeconds: 360,
    title: "What Is Ownership?",
  },
  {
    id: 75,
    assistRates: { listened: 0.27, lookedUp: 0.52, translated: 0.29 },
    averageElapsedSeconds: 268,
    correctRate: 0.81,
    difficulty: 2,
    overtimeRate: 0.06,
    publishedAt: "2026-09-21",
    solvedAttempts: 251,
    solvedUsers: 203,
    sourceName: "Kubernetes ドキュメント",
    status: "published",
    timeLimitSeconds: 390,
    title: "Pod Lifecycle",
  },
  {
    id: 63,
    assistRates: { listened: 0.12, lookedUp: 0.48, translated: 0.22 },
    averageElapsedSeconds: 241,
    correctRate: 0.77,
    difficulty: 2,
    overtimeRate: 0.04,
    publishedAt: "2026-09-30",
    solvedAttempts: 132,
    solvedUsers: 117,
    sourceName: "Go 公式ドキュメント",
    status: "published",
    timeLimitSeconds: 330,
    title: "Working with errors in Go",
  },
  {
    id: 64,
    assistRates: { listened: 0.1, lookedUp: 0.7, translated: 0.5 },
    averageElapsedSeconds: 355,
    correctRate: 0.44,
    difficulty: 3,
    overtimeRate: 0.4,
    publishedAt: null,
    solvedAttempts: 10,
    solvedUsers: 9,
    sourceName: "Go 公式ドキュメント",
    status: "draft",
    timeLimitSeconds: 300,
    title: "Errors are values",
  },
  {
    id: 230,
    assistRates: { listened: null, lookedUp: null, translated: null },
    averageElapsedSeconds: null,
    correctRate: null,
    difficulty: 1,
    overtimeRate: null,
    publishedAt: "2026-10-15",
    solvedAttempts: 0,
    solvedUsers: 0,
    sourceName: "React 公式ドキュメント",
    status: "published",
    timeLimitSeconds: 270,
    title: "Responding to Events",
  },
  ...MOCK_PASSAGE_ROWS
    .filter(row => row.status === "published" && row.id >= 200)
    .map((row, index): PassageStatsRow => {
      const solvedAttempts = 8 + ((index * 41) % 150)
      const timeLimitSeconds = calculateTimeLimitSeconds(row.wordCount, row.difficulty ?? 2, row.questionCount ?? 4)
      return {
        id: row.id,
        assistRates: { listened: ((index * 7) % 30) / 100, lookedUp: (40 + ((index * 11) % 35)) / 100, translated: (15 + ((index * 13) % 40)) / 100 },
        averageElapsedSeconds: Math.round(timeLimitSeconds * (0.55 + ((index * 9) % 40) / 100)),
        correctRate: (52 + ((index * 17) % 42)) / 100,
        difficulty: row.difficulty ?? 2,
        overtimeRate: ((index * 5) % 25) / 100,
        publishedAt: `2026-09-${String(28 - (index % 20)).padStart(2, "0")}`,
        solvedAttempts,
        solvedUsers: Math.round(solvedAttempts * (0.72 + ((index * 3) % 20) / 100)),
        sourceName: row.sourceName,
        status: "published",
        timeLimitSeconds,
        title: row.title,
      }
    }),
]

/**
 * 解いた回数を factor 倍にする（0 になった行は比率を null にする）。解かれていない下書きは除く（API と同じく、公開中か解かれた問題だけ）
 */
const scalePassageStats = (rows: PassageStatsRow[], factor: number): PassageStatsRow[] =>
  rows
    .map((row) => {
      const solvedAttempts = Math.round(row.solvedAttempts * factor)
      if (solvedAttempts === 0) {
        return {
          ...row,
          assistRates: { listened: null, lookedUp: null, translated: null },
          averageElapsedSeconds: null,
          correctRate: null,
          overtimeRate: null,
          solvedAttempts: 0,
          solvedUsers: 0,
        }
      }
      return { ...row, solvedAttempts, solvedUsers: Math.max(1, Math.round(row.solvedUsers * factor)) }
    })
    .filter(row => row.status === "published" || row.solvedAttempts > 0)

/**
 * 解いた回数の合計が total になるよう増減させる（丸めの差は先頭の行で埋める）
 */
const scalePassageStatsToTotal = (rows: PassageStatsRow[], total: number): PassageStatsRow[] => {
  const baseTotal = rows.reduce((sum, row) => sum + row.solvedAttempts, 0)
  const scaled = scalePassageStats(rows, total / baseTotal)
  const difference = total - scaled.reduce((sum, row) => sum + row.solvedAttempts, 0)
  return scaled.map((row, index) => (index === 0 ? { ...row, solvedAttempts: row.solvedAttempts + difference } : row))
}

/**
 * まだ誰も解いていない状態の問題ごとの成績（公開中の問題だけが、解いた回数 0・比率は null で並ぶ）
 */
export const convertToUnsolvedPassageStats = (rows: PassageStatsRow[]): PassageStatsRow[] => scalePassageStats(rows, 0)

export const MOCK_PASSAGE_STATS: Record<AdminStatsPeriod, PassageStatsRow[]> = {
  "30d": scalePassageStatsToTotal(PASSAGE_STATS_BASE, MOCK_OVERVIEWS["30d"].solvedAttempts),
  "7d": scalePassageStatsToTotal(PASSAGE_STATS_BASE, MOCK_OVERVIEWS["7d"].solvedAttempts),
  all: scalePassageStatsToTotal(PASSAGE_STATS_BASE, MOCK_OVERVIEWS.all.solvedAttempts),
}

export type QuestionStats = {
  id: number
  answerCount: number
  choiceRates: number[]
  choices: string[]
  correctChoiceIndex: number
  correctRate: number
  orderIndex: number
  prompt: string
  type: AdminQuestion["type"]
  unansweredRate: number
}

/**
 * 問題の分析（What Is Ownership?、直近 30 日）。Q2・Q4 は誤りの選択肢が正解より多く選ばれている（要確認）
 */
export const MOCK_QUESTION_STATS: QuestionStats[] = [
  {
    id: 571,
    answerCount: 214,
    choiceRates: [0.07, 0.84, 0.05, 0.03],
    choices: [
      "To compare Rust's performance with other languages",
      "To explain the rules Rust uses to manage memory without a garbage collector",
      "To show how to install the Rust compiler",
      "To argue that manual memory management is always better",
    ],
    correctChoiceIndex: 1,
    correctRate: 0.84,
    orderIndex: 0,
    prompt: "What is the main purpose of this passage?",
    type: "main_idea",
    unansweredRate: 0.01,
  },
  {
    id: 572,
    answerCount: 214,
    choiceRates: [0.46, 0.39, 0.09, 0.02],
    choices: [
      "The value is copied to the new variable",
      "The first variable is no longer valid",
      "Both variables point to different heap data",
      "The compiler frees the memory immediately",
    ],
    correctChoiceIndex: 1,
    correctRate: 0.39,
    orderIndex: 1,
    prompt: "According to the passage, what happens when a String is assigned to another variable?",
    type: "detail",
    unansweredRate: 0.04,
  },
  {
    id: 573,
    answerCount: 214,
    choiceRates: [0.11, 0.06, 0.71, 0.1],
    choices: [
      "removed from the program",
      "copied twice",
      "transferred to another owner",
      "locked for writing",
    ],
    correctChoiceIndex: 2,
    correctRate: 0.71,
    orderIndex: 2,
    prompt: "In paragraph 4, the word \"moved\" is closest in meaning to",
    type: "vocabulary",
    unansweredRate: 0.02,
  },
  {
    id: 574,
    answerCount: 214,
    choiceRates: [0.15, 0.28, 0.08, 0.38],
    choices: [
      "Because the heap is faster than the stack",
      "Because it prevents double free errors",
      "Because the stack cannot store integers",
      "Because Rust does not support references",
    ],
    correctChoiceIndex: 1,
    correctRate: 0.28,
    orderIndex: 3,
    prompt: "Why can the author say that Rust's approach avoids a whole class of bugs?",
    type: "inference",
    unansweredRate: 0.11,
  },
]

// ========================================================
// ユーザー管理（admin-users）
// ========================================================

export type MockUser = {
  id: number
  avatarUrl: string | null
  email: string | null
  lastStudiedDate: string | null
  name: string | null
  providers: string[]
  solvedAttempts: number
  timezone: string
  createdAt: string
}

export const AUTH_PROVIDER_LABELS: Record<string, string> = {
  dev: "dev",
  github: "GitHub",
  google: "Google",
}

const USER_NAMES = [
  "alice", "bob", "kenta-f", "yuki.dev", "hanako", "taro-yamada", "mika_s", "shota", "riko.tech", "daichi",
  "sakura", "ren-k", "aoi", "haruto", "mei", "sora.io", "kaito", "yui-n", "minato", "hina",
  "takumi", "nana", "kou", "emi.codes", "ryo", "asahi",
]

/**
 * alice（ID 1）の解いた回数。一覧と詳細の学習のまとめ（MOCK_USER_STATS）でそろえる
 */
const MOCK_ALICE_SOLVED_ATTEMPTS = 87

/**
 * alice（ID 1）の登録日。カレンダーはこの日より前を学習なしにする
 */
const MOCK_ALICE_CREATED_DATE = "2026-04-06"

/**
 * alice の連続学習日数（今日を含む）。カレンダーの直近の日と学習履歴をこれに合わせる
 */
const MOCK_ALICE_STREAK_DAYS = 6

export const MOCK_USERS: MockUser[] = USER_NAMES.map((name, index): MockUser => {
  const hasStudied = index % 6 !== 4
  const createdDate = addDays("2026-04-06", index * 7)
  const studiedDate = addDays(MOCK_TODAY, -((index * 5) % 40))
  return {
    id: index + 1,
    avatarUrl: index % 3 === 2 ? null : `/images/user/user-${String((index % 9) + 1).padStart(2, "0")}.jpg`,
    email: index === 7 ? null : `${name.replace(/[._]/g, "")}@example.com`,
    lastStudiedDate: hasStudied ? (studiedDate < createdDate ? createdDate : studiedDate) : null,
    name: index === 11 ? null : name,
    providers: index < 2 ? ["dev"] : index % 5 === 0 ? ["github", "google"] : ["github"],
    solvedAttempts: index === 0 ? MOCK_ALICE_SOLVED_ATTEMPTS : hasStudied ? 1 + ((index * 29) % 160) : 0,
    timezone: index % 8 === 3 ? "America/Los_Angeles" : "Asia/Tokyo",
    createdAt: `${createdDate} ${String(9 + (index % 12)).padStart(2, "0")}:${String((index * 13) % 60).padStart(2, "0")}`,
  }
})

/**
 * ユーザーの詳細の学習のまとめ（alice。マイページと同じ数字）
 */
export const MOCK_USER_STATS = {
  goal: { isWeeklyAchieved: false, weeklyMetric: "passages" as const, weeklyProgress: 3, weeklyTarget: 5 },
  noAssistRate: 0.66,
  streak: { current: MOCK_ALICE_STREAK_DAYS, longest: 19 },
  totals: { attemptCount: MOCK_ALICE_SOLVED_ATTEMPTS, correctRate: 0.74, passageCount: 61, studySeconds: 28_440 },
  typeAccuracy: [
    { rate: 0.86, type: "main_idea" as const },
    { rate: 0.78, type: "detail" as const },
    { rate: 0.71, type: "vocabulary" as const },
    { rate: 0.62, type: "inference" as const },
    { rate: 0.69, type: "purpose" as const },
  ],
  vocabulary: { dueCount: 12, learningCount: 48, masteredCount: 133, newCount: 9, nextDueDate: "2026-10-16" },
}

/**
 * 学習カレンダー（直近 53 週、月曜始まり）。level は 0（学習なし）〜 4。
 * 直近 MOCK_ALICE_STREAK_DAYS 日は学習あり、その前の日は学習なしにして、連続学習日数とそろえる
 */
export const MOCK_USER_CALENDAR: { date: string, level: 0 | 1 | 2 | 3 | 4 }[] = Array.from({ length: 53 * 7 }, (_, index) => {
  const start = addDays(MOCK_TODAY, -(52 * 7 + (new Date(`${MOCK_TODAY}T00:00:00Z`).getUTCDay() + 6) % 7))
  const date = addDays(start, index)
  const seed = (index * 37 + Math.floor(index / 7) * 11) % 17
  const streakStart = addDays(MOCK_TODAY, -(MOCK_ALICE_STREAK_DAYS - 1))
  if (date > MOCK_TODAY || date < MOCK_ALICE_CREATED_DATE || date === addDays(streakStart, -1)) return { date, level: 0 }
  if (date >= streakStart) return { date, level: seed < 6 ? 1 : seed < 11 ? 2 : seed < 15 ? 3 : 4 }
  return { date, level: seed < 7 ? 0 : seed < 10 ? 1 : seed < 13 ? 2 : seed < 15 ? 3 : 4 }
})

export type MockUserAttempt = {
  id: number
  assists: { listened: number, lookedUp: number, translated: number }
  correctCount: number
  elapsedSeconds: number
  passageId: number
  questionCount: number
  submittedAt: string
  timeLimitSeconds: number
  title: string
}

/**
 * 学習履歴（新しい順。「さらに読み込む」を見せるため 14 件。1 日 3 件ずつ、連続学習日数の範囲に収める）
 */
export const MOCK_USER_ATTEMPTS: MockUserAttempt[] = PASSAGE_STATS_BASE
  .filter(row => row.solvedAttempts > 0)
  .slice(0, 14)
  .map((row, index): MockUserAttempt => ({
    id: 900 - index,
    assists: { listened: index % 4 === 0 ? 2 : 0, lookedUp: (index * 3) % 5, translated: index % 3 === 0 ? 1 : 0 },
    correctCount: 2 + (index % 3),
    elapsedSeconds: Math.round(row.timeLimitSeconds * (0.6 + (index % 5) / 10)),
    passageId: row.id,
    questionCount: 4,
    submittedAt: `${addDays(MOCK_TODAY, -Math.floor(index / 3))} ${["21", "18", "12"][index % 3]}:${String((index * 17) % 60).padStart(2, "0")}`,
    timeLimitSeconds: row.timeLimitSeconds,
    title: row.title,
  }))
