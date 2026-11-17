import type { TrackEventInput } from "./event"
import type { EventTracker } from "./tracker"

/**
 * worker を動かさない環境で使う。queue に入れても処理する worker がいないと、ジョブが Redis に溜まり続ける。
 */
export class NoopEventTracker implements EventTracker {
  public async flush(): Promise<void> {
    /**
     * 送出しないので、待つものは無い
     */
  }

  public track(_input: TrackEventInput): void {
    /**
     * 捨てる
     */
  }

  public trackAll(_inputs: TrackEventInput[]): void {
    /**
     * 捨てる
     */
  }
}
