import type { TrackEventInput } from "./event"

/**
 * track / trackAll の戻り値を void にして、呼び出し元に送出の成否を知らせない。
 * 分析用のイベントの送出に失敗しても、ユーザーのリクエストを失敗させないため。
 * 失敗は実装側で catch して logger に出す。
 *
 * interface にしているのは、送出の方法（queue / ログ経由など）を変えても呼び出し元を変えずに済ませるため。
 */
export interface EventTracker {
  /**
   * 送出中のイベントがすべて終わるまで待つ。失敗は実装側で catch 済みなので reject しない。
   *
   * Lambda はレスポンスを返した時点で実行環境を凍結するため、await していない送出が
   * 止まったまま失われうる。レスポンスの前にこれを待つことで取りこぼしを防ぐ。
   */
  flush(): Promise<void>
  track(input: TrackEventInput): void
  trackAll(inputs: TrackEventInput[]): void
}
