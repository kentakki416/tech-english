import type { TrackEventInput } from "./event"

/**
 * 行動イベントの送出抽象
 *
 * **戻り値が void なのは意図的。** 呼び出し元に送出の成否を知らせないことで、
 * 分析用のイベントがユーザーのリクエストを失敗させないようにしている。
 * 失敗は実装側で catch して logger に落とす。
 *
 * この interface を挟んでいるのは transport を差し替えられるようにするため。
 * 現状は Queue 実装だが、ログ経由へ切り替えても service 層は変更不要。
 * 詳細は docs/spec/user-behavior-events/deferred-event-delivery.md を参照。
 */
export interface EventTracker {
  /**
   * 送出中のイベントがすべて終わるまで待つ。失敗は実装側で catch 済みなので reject しない。
   *
   * Lambda はレスポンスを返した時点で実行環境を凍結するため、await していない送出が
   * 止まったまま失われうる。レスポンスの前にこれを待つことで取りこぼしを防ぐ
   * （docs/spec/minimal-deploy/README.md「Lambda の凍結とイベント送出」）。
   */
  flush(): Promise<void>
  track(input: TrackEventInput): void
  trackAll(inputs: TrackEventInput[]): void
}
