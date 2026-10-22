import type { EnqueueOptions, JobQueue } from "@repo/queue"

/**
 * 積んだジョブを配列に持つだけの Queue。Queue の抽象（JobQueue）の外側だけを差し替え、Redis 自体はモックしない
 * （@repo/events の FakeEventTracker と同じ扱い）
 */
export class FakeJobQueue<T> implements JobQueue<T> {
  public readonly enqueued: { data: T; options: EnqueueOptions | undefined }[] = []

  public async close(): Promise<void> {
    /** 閉じる接続が無い */
  }

  public async enqueue(data: T, options?: EnqueueOptions): Promise<void> {
    this.enqueued.push({ data, options })
  }

  public clear(): void {
    this.enqueued.length = 0
  }
}
