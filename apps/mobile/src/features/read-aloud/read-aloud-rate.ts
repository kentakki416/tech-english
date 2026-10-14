import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * 読み上げの速度の設定。端末（AsyncStorage）に保存し、次の挑戦や結果画面でも使う（web は localStorage の同じキー）。
 * アカウント削除の AsyncStorage.clear() で一緒に消える（個人の情報ではないので、消えても困らない）
 */

export type ReadAloudRate = 0.75 | 1 | 1.25

export const READ_ALOUD_RATES: readonly ReadAloudRate[] = [0.75, 1, 1.25]

export const DEFAULT_READ_ALOUD_RATE: ReadAloudRate = 1

const RATE_STORAGE_KEY = "read-aloud-rate"

const isReadAloudRate = (value: unknown): value is ReadAloudRate => READ_ALOUD_RATES.includes(value as ReadAloudRate)

/**
 * AsyncStorage の `read-aloud-rate`。無い・読めない・不正な値は 1 倍
 */
export const readReadAloudRate = async (): Promise<ReadAloudRate> => {
  try {
    const stored = await AsyncStorage.getItem(RATE_STORAGE_KEY)
    const rate = stored === null ? null : Number(stored)
    return isReadAloudRate(rate) ? rate : DEFAULT_READ_ALOUD_RATE
  } catch {
    return DEFAULT_READ_ALOUD_RATE
  }
}

/**
 * 保存に失敗しても、開いている画面では選んだ速度で再生する（次に開いたときは保存していた速度になる）
 */
export const writeReadAloudRate = async (rate: ReadAloudRate): Promise<void> => {
  try {
    await AsyncStorage.setItem(RATE_STORAGE_KEY, String(rate))
  } catch {
    /**
     * 保存できなくても再生は続けられる
     */
  }
}

/**
 * 押すたびに 0.75 → 1 → 1.25 → 0.75（mobile はメニューを開かない）
 */
export const findNextReadAloudRate = (rate: ReadAloudRate): ReadAloudRate =>
  READ_ALOUD_RATES[(READ_ALOUD_RATES.indexOf(rate) + 1) % READ_ALOUD_RATES.length] ?? DEFAULT_READ_ALOUD_RATE
