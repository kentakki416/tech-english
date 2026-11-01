/**
 * ソースの種別。登録の画面では選ばず、新しいソースは docs にする
 *
 * - docs: 公式ドキュメント
 * - github: README / RFC などリポジトリそのものの文書
 */
export const SOURCE_KINDS = ["docs", "github"] as const

/**
 * ソースの取得方法
 *
 * - github_repository: GitHub リポジトリの Markdown
 * - website: サイトのページ（ローカルの URL から追加だけが使う。収集はしない）
 */
export const SOURCE_FETCH_TYPES = ["github_repository", "website"] as const

/**
 * 公開してよいライセンス（SPDX 識別子）。
 * 本文を載せるだけでなく和訳・設問という派生物を作って公開し、将来の有料化も見込むため、複製・改変・商用利用をすべて許すものだけを入れる。
 * ShareAlike（CC-BY-SA-*）・コピーレフト（GPL-*）は派生物にも同じライセンスを課すため、NonCommercial（CC-BY-NC-*）は商用利用を禁じるため、
 * NoDerivatives（CC-BY-ND-*）は和訳を作れないため入れない
 *
 * アプリは問題の画面と結果の画面に、出典としてソースの表示名（取得元へのリンク）・取得した時点・
 * ライセンス名（ライセンスの記載がある URL へのリンク）・「一部を抜粋・改変しています」を出す（docs/spec/content-collection/README.md の「出典表示」）
 */
export const ALLOWED_LICENSES = [
  /**
   * 使用・複製・改変・再配布・販売を許す。条件は、コピーと「実質的な部分（substantial portions）」に著作権表示とライセンス文を含めること。
   * アプリは著作権表示とライセンス文を全文では載せず、ライセンスの記載がある URL へのリンクで示している
   */
  "MIT",
  /**
   * 複製・改変・再配布・商用利用を許し、特許の利用も許諾する。条件は、ライセンスの写しを渡すこと・変更したことを示すこと・
   * 著作権などの表示と NOTICE ファイルの帰属表示を残すこと。
   * アプリはライセンスを URL へのリンクで示し、変更は「一部を抜粋・改変しています」で示す。NOTICE ファイルの中身は出していない
   */
  "Apache-2.0",
  /**
   * 再配布と改変を許す。条件は、著作権表示・条件の一覧・免責の文を残すこと。
   * アプリはこれらを全文では載せず、ライセンスの記載がある URL へのリンクで示している
   */
  "BSD-2-Clause",
  /**
   * BSD-2-Clause に、作者の名前を許可なく宣伝・推奨に使わない条件を足したもの。
   * アプリは表示名を出典として出すだけで、推奨の表示には使わない。ほかは BSD-2-Clause と同じ
   */
  "BSD-3-Clause",
  /**
   * MIT とほぼ同じ内容を短く書いたもの。条件は、すべてのコピーに著作権表示と許諾の文を含めること。
   * アプリはこれらを全文では載せず、ライセンスの記載がある URL へのリンクで示している
   */
  "ISC",
  /**
   * 共有と翻案（翻訳を含む）を商用も含めて許す。条件は、作者などの表示・ライセンスへのリンク・改変したかどうかの表示。
   * 作者などの表示は、必要な情報が載ったページへのリンクでもよいとされているので、取得元へのリンクで満たす。
   * ライセンスへのリンクと「一部を抜粋・改変しています」も出す（改変の表示はこのライセンスのために出している）
   */
  "CC-BY-4.0",
  /**
   * Python とそのドキュメントのライセンス。複製・改変・再配布を許す。条件は、PSF の著作権表示とライセンスを残すことと、派生物に変更点の概要を含めること。
   * アプリは著作権表示とライセンスを全文では載せずライセンスの記載がある URL へのリンクで示し、変更点は「一部を抜粋・改変しています」とだけ示す
   */
  "PSF-2.0",
  /**
   * 著作権を放棄し、パブリックドメインと同じように使えるようにする。条件は無い。アプリはほかのライセンスと同じく出典を出す
   */
  "CC0-1.0",
  /**
   * 著作物をパブリックドメインに捧げる宣言。条件は無い。アプリはほかのライセンスと同じく出典を出す
   */
  "Unlicense",
] as const

/**
 * ライセンスの記載が無いサイトを、自分で読むためだけに取り込むときの値。ローカルのサイトのソースだけが使う（著作権法の私的使用の範囲にとどめるため、
 * デプロイした環境には入れない）。`LicenseRef-` は SPDX で独自のライセンスを表す書き方
 */
export const PERSONAL_USE_LICENSE = "LicenseRef-personal-use"

/**
 * ソースに入れられるライセンス。DB の CHECK 制約はここから作る
 */
export const SOURCE_LICENSES = [...ALLOWED_LICENSES, PERSONAL_USE_LICENSE] as const

/**
 * GitHub のリポジトリ名（owner/name）の形。owner は英数字とハイフン（39 文字まで）、name は英数字と . _ -（"." と ".." は不可）
 */
export const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/

/**
 * URL からソースの登録の初期値を作れない理由（400 の details[0].code）
 *
 * - github_url: サイトの登録で github.com の URL（GitHub の登録の画面で登録する）
 * - not_repository_url: GitHub の登録で、github.com 以外の URL・owner / repo が無い・形が違う
 * - repository_not_found: GitHub の登録で、GitHub にリポジトリが無い（非公開を含む）
 * - unsupported_repository: GitHub の登録で、本文を問題にできないリポジトリ
 * - website_unavailable: ローカル以外でサイトの登録（サイトのソースはローカルだけ）
 */
export const SOURCE_SUGGESTION_ERROR_CODES = ["github_url", "not_repository_url", "repository_not_found", "unsupported_repository", "website_unavailable"] as const
