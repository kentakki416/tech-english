/**
 * DB の ID（serial。PostgreSQL の integer）の最大値。ID を受け取る API はこれより大きい値を 400 にする
 * （そのまま DB に渡すと範囲外のエラーで 500 になるため）
 */
export const MAX_SERIAL_ID = 2_147_483_647
