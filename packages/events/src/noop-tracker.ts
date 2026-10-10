import type { EventTracker } from "./tracker"

/**
 * イベントを捨てる EventTracker
 *
 * worker を動かさない環境（minimal 構成で worker を作らない場合）で使う。Queue に入れても
 * 処理する worker がいないため、ジョブが Redis に溜まり続けるのを防ぐ。
 * worker の DATA_WAREHOUSE_TYPE=none と同じく、記録しないことを env で明示的に選んだときだけ使う。
 */
export class NoopEventTracker implements EventTracker {
  public async flush(): Promise<void> {
    /** 送出しないので、待つものは無い */
  }

  public track(): void {
    /** 捨てる */
  }

  public trackAll(): void {
    /** 捨てる */
  }
}
