/**
 * 読み取りの指定。fromPrimary: true は read replica の遅れを避けて primary から読む
 * （書き込みの直後の読み直しや、同時操作で書き込めなかった後の読み直しに使う）
 */
export type ReadOptions = { fromPrimary?: boolean }
