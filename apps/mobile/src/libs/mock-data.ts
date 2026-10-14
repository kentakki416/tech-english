/**
 * デザインモック（/mock 配下）用のダミーデータ（web のモックと同じ内容）
 *
 * API を呼ばずに画面を表現するためのハードコード値。本実装では `@repo/api-schema` の
 * レスポンス型に置き換わる。本文の英文はモック用に書いたもので、実在の文書の引用ではない。
 */

export type MockBlockType = "code" | "heading" | "list_item" | "paragraph" | "quote"

export type MockPassageBlock = {
  lang?: string
  text: string
  translationJa?: string
  type: MockBlockType
}

export type MockGlossaryEntry = {
  id: number
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa?: string
  partOfSpeech: string
  surface: string
}

export type MockQuestionType = "detail" | "inference" | "main_idea" | "purpose" | "vocabulary"

export type MockQuestion = {
  id: number
  choices: string[]
  correctChoiceIndex: number
  evidence: { blockIndex: number, quote: string }
  explanationJa: string
  prompt: string
  type: MockQuestionType
}

export type MockSourceKind = "docs" | "github"

export type MockDifficulty = 1 | 2 | 3

export type MockWordLookup = {
  meaningJa: string
  source: "dictionary" | "glossary"
  surface: string
}

export const QUESTION_TYPE_LABELS: Record<MockQuestionType, string> = {
  detail: "詳細",
  inference: "推論",
  main_idea: "要旨",
  purpose: "意図",
  vocabulary: "語義",
}

export const DIFFICULTY_LABELS: Record<MockDifficulty, string> = {
  1: "Easy",
  2: "Normal",
  3: "Hard",
}

export const SOURCE_KIND_LABELS: Record<MockSourceKind, string> = {
  docs: "Docs",
  github: "GitHub",
}

/**
 * 解答画面・結果画面で使う問題
 */
export const MOCK_PASSAGE = {
  id: 42,
  difficulty: 2 as MockDifficulty,
  kind: "docs" as MockSourceKind,
  license: "CC-BY-4.0",
  permalink: "https://github.com/reactjs/react.dev/blob/3f9c2a1/src/content/learn/synchronizing-with-effects.md",
  sourceName: "React 公式ドキュメント",
  sourceUrl: "https://react.dev/learn/synchronizing-with-effects",
  timeLimitSeconds: 330,
  title: "Synchronizing with Effects",
  wordCount: 332,
}

export const MOCK_BLOCKS: MockPassageBlock[] = [
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

export const MOCK_GLOSSARY: MockGlossaryEntry[] = [
  {
    id: 1,
    blockIndex: 1,
    lemma: "stay in sync with",
    meaningJa: "〜と同期した状態を保つ",
    partOfSpeech: "熟語",
    surface: "stay in sync with",
  },
  {
    id: 2,
    blockIndex: 1,
    lemma: "escape hatch",
    meaningJa: "（通常の仕組みから）必要なときに抜け出すための手段",
    noteJa: "技術文書では、抽象化の外にある低レベルな機能を使うための「逃げ道」を指すことが多い。",
    partOfSpeech: "名詞",
    surface: "escape hatch",
  },
  {
    id: 3,
    blockIndex: 1,
    lemma: "step outside of",
    meaningJa: "〜の外に出る、〜の枠組みから外れる",
    partOfSpeech: "熟語",
    surface: "step outside of",
  },
  {
    id: 4,
    blockIndex: 2,
    lemma: "reach for",
    meaningJa: "（解決策として）〜を使おうとする",
    noteJa: "「手を伸ばす」から転じて、ある道具や手段に頼ろうとすることを表す。",
    partOfSpeech: "熟語",
    surface: "reaching for",
  },
  {
    id: 5,
    blockIndex: 3,
    lemma: "derive",
    meaningJa: "（既存の値から）導き出す、算出する",
    noteJa: "derived state（派生した状態）はフロントエンドの文書で頻出。",
    partOfSpeech: "動詞",
    surface: "derived",
  },
  {
    id: 6,
    blockIndex: 5,
    lemma: "opt out of",
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    noteJa: "対になるのは opt in（自分で選んで有効にする）。",
    partOfSpeech: "熟語",
    surface: "opt out of",
  },
  {
    id: 7,
    blockIndex: 5,
    lemma: "under the hood",
    meaningJa: "内部では、仕組みとしては",
    noteJa: "車のボンネット（hood）の下、つまり外から見えない内部の仕組みのこと。",
    partOfSpeech: "熟語",
    surface: "Under the hood",
  },
  {
    id: 8,
    blockIndex: 6,
    lemma: "caveat",
    meaningJa: "注意点、但し書き",
    partOfSpeech: "名詞",
    surface: "caveat",
  },
  {
    id: 9,
    blockIndex: 6,
    lemma: "intentionally",
    meaningJa: "意図的に、わざと",
    partOfSpeech: "副詞",
    surface: "intentionally",
  },
  {
    id: 10,
    blockIndex: 6,
    lemma: "resilient",
    meaningJa: "（変化や障害に）強い、すぐに元に戻れる",
    partOfSpeech: "形容詞",
    surface: "resilient",
  },
]

/**
 * 語義設問（Q3）の対象語句。解答中は用語集から外す
 */
export const MOCK_HIDDEN_GLOSSARY_IDS = [2]

/**
 * 英和辞書（EJDict-hand 相当）のダミー。用語集に無い単語をタップしたときに引く
 */
export const MOCK_DICTIONARY: Record<string, string> = {
  api: "アプリケーション・プログラミング・インターフェース",
  browser: "閲覧者 / （インターネットの）ブラウザ",
  cleanup: "大掃除、一掃",
  component: "構成要素、成分",
  connection: "結合、接続、関係",
  dependency: "依存、従属、依存しているもの",
  disconnect: "（…から）…を切り離す、…の接続を断つ",
  escape: "（…から）逃げる、脱出する / 逃亡、脱出",
  handler: "（…を）扱う人、処理するもの",
  hatch: "（船の）昇降口、ハッチ / （床・天井などの）開口部",
  intend: "（…する）つもりである、…を意図する",
  interaction: "相互作用、相互の影響",
  mistake: "誤り、間違い / …を間違える",
  mount: "（…に）登る / …を据え付ける、取り付ける",
  render: "（…を）…にする / …を表現する、描写する",
  synchronize: "同時に起こる / （…と）…を同期させる",
  widget: "（名前のわからない）小さな装置、部品",
}

export const MOCK_QUESTIONS: MockQuestion[] = [
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
    explanationJa: "本文は、エフェクトが外部のシステムと同期するための手段であること（第 1 段落）、イベントハンドラや計算で済む場合は使わないこと（第 2・3 段落）、使う場合の依存配列とクリーンアップ（第 4・5 段落）を順に説明しています。A は第 4 段落の一部の話題にすぎず、C は「使うべきでない」とまでは述べていないため誤りです。",
    prompt: "What is the main purpose of this passage?",
    type: "main_idea",
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
    explanationJa: "第 2 段落に「ユーザーがボタンをクリックしたために実行されるロジックなら、エフェクトではなくイベントハンドラに書くべき」とあります。A と B はエフェクトの中に書く方法で、本文の主張と逆です。",
    prompt: "According to the passage, where should logic that runs because the user clicked a button be placed?",
    type: "detail",
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
    explanationJa: "escape hatch は直訳すると「脱出用のハッチ」です。直後に「React のレンダーの仕組みの外に出るために使う」と続いており、通常の仕組みから必要なときだけ抜け出す手段を指しています。C の「性能を上げる近道」は本文に無い意味です。",
    prompt: "In paragraph 1, the phrase \"escape hatch\" is closest in meaning to",
    type: "vocabulary",
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
    explanationJa: "第 5 段落に「クリーンアップ関数が欠けているエフェクトを見つけやすくするために、React は意図的にコンポーネントを 2 回マウントする」とあります。A・B のような性能面の理由は述べられていません。",
    prompt: "Why does React mount components twice in development?",
    type: "inference",
  },
]

/**
 * 結果画面で使う、提出済みの回答（Q3 だけ不正解）
 */
export const MOCK_SUBMITTED_ANSWERS: Record<number, number | null> = {
  1: 1,
  2: 2,
  3: 2,
  4: 2,
}

export const MOCK_RESULT = {
  elapsedSeconds: 312,
  translatedBlockCount: 1,
  wordLookups: [
    { meaningJa: "（解決策として）〜を使おうとする", source: "glossary", surface: "reaching for" },
    { meaningJa: "（船の）昇降口、ハッチ", source: "dictionary", surface: "hatch" },
    { meaningJa: "〜をやめる、（既定の動作を）無効にする", source: "glossary", surface: "opt out of" },
  ] satisfies MockWordLookup[],
}

export type MockPassageSummary = {
  id: number
  attemptCount: number
  bestCorrect: number | null
  difficulty: MockDifficulty
  inProgress: boolean
  kind: MockSourceKind
  questionCount: number
  sourceName: string
  tags: string[]
  timeLimitSeconds: number
  title: string
  wordCount: number
}

export const MOCK_PASSAGE_LIST: MockPassageSummary[] = [
  {
    id: 42,
    attemptCount: 1,
    bestCorrect: 3,
    difficulty: 2,
    inProgress: false,
    kind: "docs",
    questionCount: 4,
    sourceName: "React 公式ドキュメント",
    tags: ["react", "frontend"],
    timeLimitSeconds: 330,
    title: "Synchronizing with Effects",
    wordCount: 332,
  },
  {
    id: 57,
    attemptCount: 0,
    bestCorrect: null,
    difficulty: 2,
    inProgress: true,
    kind: "docs",
    questionCount: 4,
    sourceName: "The Rust Programming Language",
    tags: ["rust"],
    timeLimitSeconds: 420,
    title: "What Is Ownership?",
    wordCount: 418,
  },
  {
    id: 63,
    attemptCount: 2,
    bestCorrect: 2,
    difficulty: 2,
    inProgress: false,
    kind: "docs",
    questionCount: 4,
    sourceName: "Go 公式ドキュメント",
    tags: ["go", "backend"],
    timeLimitSeconds: 360,
    title: "Working with errors in Go",
    wordCount: 365,
  },
  {
    id: 71,
    attemptCount: 0,
    bestCorrect: null,
    difficulty: 3,
    inProgress: false,
    kind: "github",
    questionCount: 5,
    sourceName: "Rust RFCs",
    tags: ["rust"],
    timeLimitSeconds: 450,
    title: "RFC: Async closures",
    wordCount: 540,
  },
  {
    id: 75,
    attemptCount: 1,
    bestCorrect: 4,
    difficulty: 2,
    inProgress: false,
    kind: "docs",
    questionCount: 4,
    sourceName: "Kubernetes ドキュメント",
    tags: ["kubernetes", "infra"],
    timeLimitSeconds: 390,
    title: "Pod Lifecycle",
    wordCount: 402,
  },
  {
    id: 80,
    attemptCount: 0,
    bestCorrect: null,
    difficulty: 1,
    inProgress: false,
    kind: "github",
    questionCount: 3,
    sourceName: "vitejs/vite",
    tags: ["vite", "frontend"],
    timeLimitSeconds: 300,
    title: "Contributing to Vite",
    wordCount: 262,
  },
  {
    id: 84,
    attemptCount: 1,
    bestCorrect: 3,
    difficulty: 1,
    inProgress: false,
    kind: "docs",
    questionCount: 3,
    sourceName: "Python ドキュメント",
    tags: ["python"],
    timeLimitSeconds: 300,
    title: "Virtual Environments and Packages",
    wordCount: 288,
  },
  {
    id: 91,
    attemptCount: 0,
    bestCorrect: null,
    difficulty: 2,
    inProgress: false,
    kind: "docs",
    questionCount: 5,
    sourceName: "Google Cloud ドキュメント",
    tags: ["gcp", "infra"],
    timeLimitSeconds: 450,
    title: "Configuring Cloud Run services",
    wordCount: 455,
  },
]

export const MOCK_USER = {
  avatarInitial: "Y",
  name: "Yuki Tanaka",
}

export const MOCK_STATS = {
  goal: {
    daysLeft: 172,
    goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
    targetDate: "2027-03-31",
    weeklyMetric: "passages" as "minutes" | "passages",
    weeklyTarget: 5,
    weeklyValue: 3,
  },
  streak: { current: 12, longest: 21 },
  totals: {
    accuracy: 78,
    attempts: 63,
    noAssistAccuracy: 71,
    passages: 48,
    studyMinutes: 552,
  },
  typeAccuracy: [
    { rate: 86, type: "main_idea" },
    { rate: 81, type: "detail" },
    { rate: 74, type: "vocabulary" },
    { rate: 62, type: "inference" },
    { rate: 70, type: "purpose" },
  ] satisfies { rate: number, type: MockQuestionType }[],
}

export type MockAttemptRow = {
  id: number
  assistUsed: boolean
  correctCount: number
  date: string
  elapsedSeconds: number
  isOvertime: boolean
  questionCount: number
  submittedTime: string
  title: string
}

export const MOCK_ATTEMPT_HISTORY: MockAttemptRow[] = [
  { id: 312, assistUsed: true, correctCount: 3, date: "2026-10-10", elapsedSeconds: 312, isOvertime: false, questionCount: 4, submittedTime: "08:14", title: "Synchronizing with Effects" },
  { id: 309, assistUsed: false, correctCount: 4, date: "2026-10-09", elapsedSeconds: 371, isOvertime: false, questionCount: 4, submittedTime: "22:41", title: "Pod Lifecycle" },
  { id: 305, assistUsed: true, correctCount: 2, date: "2026-10-09", elapsedSeconds: 402, isOvertime: true, questionCount: 4, submittedTime: "07:58", title: "Working with errors in Go" },
  { id: 301, assistUsed: false, correctCount: 3, date: "2026-10-08", elapsedSeconds: 255, isOvertime: false, questionCount: 3, submittedTime: "21:12", title: "Virtual Environments and Packages" },
  { id: 297, assistUsed: true, correctCount: 1, date: "2026-10-07", elapsedSeconds: 391, isOvertime: false, questionCount: 4, submittedTime: "08:03", title: "Working with errors in Go" },
  { id: 290, assistUsed: false, correctCount: 4, date: "2026-10-06", elapsedSeconds: 344, isOvertime: false, questionCount: 5, submittedTime: "23:30", title: "Configuring Cloud Run services" },
]

export type MockCalendarLevel = 0 | 1 | 2 | 3 | 4

export type MockCalendarDay = {
  attemptCount: number
  /**
   * 単語帳で答えた枚数（vocabulary-cards spec）
   */
  cardCount: number
  date: string
  level: MockCalendarLevel
  /**
   * 単語帳で「覚えた」を付けた数
   */
  rememberedCount: number
  /**
   * 挑戦と単語帳の合計
   */
  studyMinutes: number
}

/**
 * モックの「今日」
 */
export const MOCK_TODAY = "2026-10-10"

const STUDY_MINUTES_BY_LEVEL: Record<MockCalendarLevel, number> = {
  0: 0,
  1: 4,
  2: 11,
  3: 22,
  4: 38,
}

const formatDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * 単語帳で答えた日（今日は挑戦と単語帳の両方、5 日前は単語帳だけ）
 */
const MOCK_VOCABULARY_DAYS: Record<string, { cardCount: number, minutes: number, rememberedCount: number }> = {
  "2026-10-05": { cardCount: 10, minutes: 3, rememberedCount: 7 },
  "2026-10-10": { cardCount: 12, minutes: 2, rememberedCount: 9 },
}

/**
 * 学習時間（分）をカレンダーの色の段階にする（learning-record spec の段階）
 */
const convertMinutesToLevel = (minutes: number): MockCalendarLevel =>
  minutes === 0 ? 0 : minutes <= 5 ? 1 : minutes <= 15 ? 2 : minutes <= 30 ? 3 : 4

/**
 * 直近 53 週（月曜始まり）の学習カレンダーを決定的に作る
 *
 * サーバーとクライアントで同じ結果になるよう、Math.random ではなく固定シードの LCG を使う。
 * 直近 12 日は連続で学習し、13 日前は休んだことにする（連続日数 12 日と合わせる）。
 */
export const createMockCalendar = (): MockCalendarDay[] => {
  const today = new Date(`${MOCK_TODAY}T00:00:00Z`)
  const mondayOffset = (today.getUTCDay() + 6) % 7
  const start = new Date(today)
  start.setUTCDate(today.getUTCDate() - mondayOffset - 52 * 7)

  let seed = 20261010
  const generateNext = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  const days: MockCalendarDay[] = []
  for (let cursor = new Date(start); cursor <= today; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const daysAgo = Math.round((today.getTime() - cursor.getTime()) / 86400000)
    const date = formatDate(cursor)
    const recorded = MOCK_ATTEMPT_HISTORY.filter(attempt => attempt.date === date)
    const roll = generateNext()

    /**
     * 履歴にある日は履歴から集計する（カレンダーと一覧の数字を揃える）
     */
    if (recorded.length > 0) {
      const cards = MOCK_VOCABULARY_DAYS[date] ?? { cardCount: 0, minutes: 0, rememberedCount: 0 }
      const studyMinutes = Math.round(recorded.reduce((sum, attempt) => sum + attempt.elapsedSeconds, 0) / 60) + cards.minutes
      days.push({
        attemptCount: recorded.length,
        cardCount: cards.cardCount,
        date,
        level: convertMinutesToLevel(studyMinutes),
        rememberedCount: cards.rememberedCount,
        studyMinutes,
      })
      continue
    }

    /**
     * 単語帳だけの日（挑戦は 0 で、単語帳の時間だけで色が付く）
     */
    const vocabularyOnly = MOCK_VOCABULARY_DAYS[date]
    if (vocabularyOnly) {
      days.push({
        attemptCount: 0,
        cardCount: vocabularyOnly.cardCount,
        date,
        level: convertMinutesToLevel(vocabularyOnly.minutes),
        rememberedCount: vocabularyOnly.rememberedCount,
        studyMinutes: vocabularyOnly.minutes,
      })
      continue
    }

    let level: MockCalendarLevel = roll < 0.42 ? 0 : roll < 0.62 ? 1 : roll < 0.8 ? 2 : roll < 0.93 ? 3 : 4
    if (daysAgo < 12 && level === 0) level = 2
    if (daysAgo === 12) level = 0
    days.push({
      attemptCount: level === 0 ? 0 : Math.max(1, Math.round(level * 0.8)),
      cardCount: 0,
      date,
      level,
      rememberedCount: 0,
      studyMinutes: STUDY_MINUTES_BY_LEVEL[level],
    })
  }
  return days
}

/**
 * 秒を `m:ss` にする
 */
export const formatSeconds = (totalSeconds: number): string => {
  const sign = totalSeconds < 0 ? "-" : ""
  const abs = Math.abs(totalSeconds)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`
}

/**
 * リマインダーの設定（study-reminder spec）。曜日は ISO（1 = 月曜 〜 7 = 日曜）
 */
export const MOCK_REMINDER = {
  isEnabled: true,
  time: "21:00",
  weekdays: [1, 2, 3, 4, 5],
}

/**
 * 単語帳のカード（vocabulary-cards spec。GET /api/vocabulary/session の 1 枚に相当）
 */
export type MockVocabularyCard = {
  lemma: string
  meaningJa: string
  meaningSource: "dictionary" | "glossary"
  noteJa: string | null
  partOfSpeech: string | null
  passageTitle: string
  /**
   * 単語を含む本文の 1 文。highlight は文の中での単語の位置 [start, end)
   */
  sentence: { highlightEnd: number, highlightStart: number, text: string } | null
  /**
   * 答える前の段階（0〜3）。新しい単語は null
   */
  stage: number | null
  surface: string
}

/**
 * 1 文の中から語句の位置を求めて、カードの 1 文を作る（モックのデータを書きやすくするため）
 */
const buildMockSentence = (text: string, surface: string): MockVocabularyCard["sentence"] => {
  const highlightStart = text.indexOf(surface)
  return { highlightEnd: highlightStart + surface.length, highlightStart, text }
}

/**
 * 1 回分のカード（今日の復習 4 枚 → 新しい単語 6 枚）
 */
export const MOCK_VOCABULARY_CARDS: MockVocabularyCard[] = [
  {
    lemma: "opt out of",
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    meaningSource: "glossary",
    noteJa: "対になるのは opt in（自分で選んで有効にする）。",
    partOfSpeech: "熟語",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "You can opt out of re-running it by specifying a dependency array, which tells React to skip the Effect unless one of the listed values has changed.",
      "opt out of",
    ),
    stage: 2,
    surface: "opt out of",
  },
  {
    lemma: "escape hatch",
    meaningJa: "（通常の仕組みから）必要なときに抜け出すための手段",
    meaningSource: "glossary",
    noteJa: "技術文書では、抽象化の外にある低レベルな機能を使うための「逃げ道」を指すことが多い。",
    partOfSpeech: "名詞",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "They are an escape hatch: you use them to step outside of React's rendering model when there is no other way to express what you need.",
      "escape hatch",
    ),
    stage: 0,
    surface: "escape hatch",
  },
  {
    lemma: "propagate",
    meaningJa: "（エラーなどを）呼び出し元へ伝える、伝播させる",
    meaningSource: "glossary",
    noteJa: null,
    partOfSpeech: "動詞",
    passageTitle: "Working with errors in Go",
    sentence: buildMockSentence(
      "Instead of panicking, a function returns an error value, and the caller decides whether to handle it or propagate it.",
      "propagate",
    ),
    stage: 1,
    surface: "propagate",
  },
  {
    lemma: "idempotent",
    meaningJa: "（何度実行しても）結果が同じになる、冪等な",
    meaningSource: "glossary",
    noteJa: "リトライの文脈で頻出。2 回実行しても 1 回実行したのと同じ状態になること。",
    partOfSpeech: "形容詞",
    passageTitle: "Configuring Cloud Run services",
    sentence: buildMockSentence(
      "Retries are only safe when the handler is idempotent: running it twice has the same effect as running it once.",
      "idempotent",
    ),
    stage: 3,
    surface: "idempotent",
  },
  {
    lemma: "reach for",
    meaningJa: "（解決策として）〜を使おうとする",
    meaningSource: "glossary",
    noteJa: "「手を伸ばす」から転じて、ある道具や手段に頼ろうとすることを表す。",
    partOfSpeech: "熟語",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "Before reaching for an Effect, ask yourself whether the code is caused by rendering or by a specific interaction.",
      "reaching for",
    ),
    stage: null,
    surface: "reaching for",
  },
  {
    lemma: "borrow",
    meaningJa: "（…から）…を借りる / （…に）…を借りる",
    meaningSource: "dictionary",
    noteJa: null,
    partOfSpeech: null,
    passageTitle: "What Is Ownership?",
    sentence: buildMockSentence(
      "Instead of taking ownership, a function can borrow a value through a reference such as `&String`.",
      "borrow",
    ),
    stage: null,
    surface: "borrow",
  },
  {
    lemma: "graceful shutdown",
    meaningJa: "（処理中の作業を終えてから）安全に停止すること",
    meaningSource: "glossary",
    noteJa: "graceful は「優雅な」。急に止めず、後片付けをしてから止める意味で使う。",
    partOfSpeech: "名詞",
    passageTitle: "Pod Lifecycle",
    sentence: buildMockSentence(
      "Kubernetes sends `SIGTERM` first, giving the container a chance to perform a graceful shutdown before it is killed.",
      "graceful shutdown",
    ),
    stage: null,
    surface: "graceful shutdown",
  },
  {
    lemma: "derive",
    meaningJa: "（既存の値から）導き出す、算出する",
    meaningSource: "glossary",
    noteJa: "derived state（派生した状態）はフロントエンドの文書で頻出。",
    partOfSpeech: "動詞",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "Because the value can be derived from existing props or state, you can simply calculate it during rendering.",
      "derived",
    ),
    stage: null,
    surface: "derived",
  },
  {
    lemma: "caveat",
    meaningJa: "注意点、但し書き",
    meaningSource: "glossary",
    noteJa: null,
    partOfSpeech: "名詞",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "One caveat: Effects only run on the client, so they are not a good fit for code that must run during server rendering.",
      "caveat",
    ),
    stage: null,
    surface: "caveat",
  },
  {
    lemma: "resilient",
    meaningJa: "（変化や障害に）強い、すぐに元に戻れる",
    meaningSource: "glossary",
    noteJa: null,
    partOfSpeech: "形容詞",
    passageTitle: "Synchronizing with Effects",
    sentence: buildMockSentence(
      "Code that cleans up in the `return` function is more resilient to remounts in development.",
      "resilient",
    ),
    stage: null,
    surface: "resilient",
  },
]

/**
 * 単語帳のトップの数（GET /api/vocabulary/summary に相当）
 */
export const MOCK_VOCABULARY_SUMMARY = {
  dueCount: 4,
  learningCount: 23,
  masteredCount: 41,
  newCount: 6,
  nextDueDate: "2026-10-11",
}

/**
 * 1 回の最大枚数
 */
export const MOCK_VOCABULARY_SESSION_SIZE = 10
