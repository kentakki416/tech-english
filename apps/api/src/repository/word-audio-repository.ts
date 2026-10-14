/**
 * 見出し語の発音の音声（word_audios）のリポジトリ。行を作る・生成の結果を書くのは cron の generate:word-audio で、api は読み取りだけを行う
 * （vocabulary-pronunciation README「単語の音声の保存と配信」）
 */
export interface WordAudioRepository {
  /**
   * lemmas のうち status = 'ready' の見出し語と mp3 のキー（見出し語 → キー）。ready の行は audio_key が必ずある（CHECK 制約）。
   * voice の変更で作り直している間（ready のまま確保された行）も前のキーを返す
   */
  findReadyKeysByLemmas(lemmas: string[]): Promise<Map<string, string>>
}
