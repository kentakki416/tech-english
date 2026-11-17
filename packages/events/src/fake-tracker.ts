import type { TrackEventInput } from "./event"
import type { EventTracker } from "./tracker"

export class FakeEventTracker implements EventTracker {
  public readonly inputs: TrackEventInput[] = []

  public async flush(): Promise<void> {
    /**
     * 送出を貯めるだけなので、待つものは無い
     */
  }

  public track(input: TrackEventInput): void {
    this.inputs.push(input)
  }

  public trackAll(inputs: TrackEventInput[]): void {
    this.inputs.push(...inputs)
  }
}
