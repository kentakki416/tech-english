import type { ReaderBlock, ReaderGlossaryEntry } from "@/components/features/passage/types"

/**
 * ログイン画面の体験デモで使う本文・用語集・英和辞書
 *
 * API を呼ばずに描画するための固定値。本文の英文はデモ用に書いたもので、実在の文書の引用ではない。
 */

export const DEMO_BLOCKS: ReaderBlock[] = [
  {
    text: "Synchronizing with Effects",
    translationJa: "エフェクトによる同期",
    type: "heading",
  },
  {
    text: "When you do need an Effect, React runs it after every render by default. In most cases, that is more often than necessary. You can opt out of re-running it by specifying a dependency array, which tells React to skip the Effect unless one of the listed values has changed. Under the hood, React compares each dependency with its previous value using `Object.is`.",
    translationJa: "エフェクトが本当に必要な場合、React はデフォルトで毎回のレンダー後にそれを実行します。ほとんどの場合、それは必要以上に頻繁です。依存配列を指定すると再実行をやめられます。依存配列は、列挙した値のどれかが変わらない限りエフェクトをスキップするよう React に伝えます。内部では、React は各依存値を前回の値と `Object.is` で比較しています。",
    type: "paragraph",
  },
]

/**
 * 用語集。`blockIndex` は DEMO_BLOCKS の添字
 */
export const DEMO_GLOSSARY: ReaderGlossaryEntry[] = [
  {
    id: 6,
    blockIndex: 1,
    lemma: "opt out of",
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    noteJa: "対になるのは opt in（自分で選んで有効にする）。",
    partOfSpeech: "熟語",
    surface: "opt out of",
  },
  {
    id: 7,
    blockIndex: 1,
    lemma: "under the hood",
    meaningJa: "内部では、仕組みとしては",
    noteJa: "車のボンネット（hood）の下、つまり外から見えない内部の仕組みのこと。",
    partOfSpeech: "熟語",
    surface: "Under the hood",
  },
]

/**
 * 英和辞書（EJDict-hand 相当）の抜粋。用語集に無い単語をクリックしたときに引く
 */
export const DEMO_DICTIONARY: Record<string, string> = {
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
