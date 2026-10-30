import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * 収集中の画面を読み直す間隔。収集は数秒〜数分なので、押した後に結果へ切り替わるのを待てる長さにする
 */
const COLLECTION_RUN_REFRESH_INTERVAL_MS = 3_000

/**
 * isCollecting の間、画面を一定の間隔で読み直す
 */
export function useCollectionRunRefresh(isCollecting: boolean) {
  const router = useRouter()

  useEffect(() => {
    if (!isCollecting) return
    const timer = setInterval(() => router.refresh(), COLLECTION_RUN_REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isCollecting, router])
}
