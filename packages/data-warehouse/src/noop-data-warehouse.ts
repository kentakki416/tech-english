import { logger } from "@repo/logger"

import type { DataWarehouse } from "./data-warehouse"

/**
 * 何も書き込まない DataWarehouse 実装
 *
 * データウェアハウスを持たない環境（Terraform の enable_data_warehouse = false の環境）で使う。
 * 行動イベントの分析価値が無い環境のためにインスタンスを常駐させるのは
 * コストに見合わないが、実装が無いと worker が起動できなくなるため
 * 「繋ぎ先が無い」を明示的に表現する実装を用意する。
 *
 * **本番で使ってはいけない。** 呼び出し側から見ると insert は成功扱いなので、
 * 設定を間違えるとイベントが無言で消える。気付けるように debug ログを出す。
 */
export class NoopDataWarehouse implements DataWarehouse {
  public async insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
    logger.debug("data warehouse is disabled, skipped insert", {
      count: rows.length,
      table,
    })
  }

  public async close(): Promise<void> {
    /** 接続を持たないので閉じるものが無い */
  }
}
