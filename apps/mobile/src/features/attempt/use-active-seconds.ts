import { useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

/**
 * 経過を確かめる間隔。表示の秒が実際の 1 秒の境目から大きくずれないよう 1 秒より細かくする
 */
const TICK_INTERVAL_MS = 250

/**
 * 1 回の確かめで数える上限。JS のタイマーが止まっていた（バックグラウンド・端末のスリープ）後に、その間を数えないようにする
 */
const MAX_TICK_MS = 2000

/**
 * 画面を見ていた秒数（reading-practice README「時間の計測」）。
 * アプリが前面（AppState.currentState === "active"）かつ isRunning の間だけ進む。
 * 戻り値は initialSeconds（端末に保存していた経過）にこの画面で数えた秒数を足したもの。
 * 1 秒ごとに足すのではなく実際の経過時間を積算するので、一時停止やアプリの切り替えで端数を失わない（web の同名の hook と同じ）
 */
export function useActiveSeconds({ initialSeconds, isRunning }: { initialSeconds: number, isRunning: boolean }): number {
  const [countedSeconds, setCountedSeconds] = useState(0)
  /**
   * この画面で数えたミリ秒（端数を含む）。描画には使わない
   */
  const countedMsRef = useRef(0)

  useEffect(() => {
    if (!isRunning) return

    /**
     * 最後に数えた時刻。アプリが前面にない間は null（その間は数えない）
     */
    let lastAt: number | null = AppState.currentState === "active" ? performance.now() : null

    const accumulate = () => {
      const now = performance.now()
      if (lastAt !== null) {
        countedMsRef.current += Math.min(now - lastAt, MAX_TICK_MS)
        setCountedSeconds(Math.floor(countedMsRef.current / 1000))
      }
      lastAt = AppState.currentState === "active" ? now : null
    }

    const timer = setInterval(accumulate, TICK_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", accumulate)
    return () => {
      /**
       * 止める直前までの端数を足しておく（表示は再開後の次の確かめで追いつく）
       */
      if (lastAt !== null) countedMsRef.current += Math.min(performance.now() - lastAt, MAX_TICK_MS)
      clearInterval(timer)
      subscription.remove()
    }
  }, [isRunning])

  return initialSeconds + countedSeconds
}
