import { sourceCollectionRuns } from "@repo/db"
import { ACTIVE_SOURCE_COLLECTION_RUN_STATUSES } from "@repo/domain"

import { testDb } from "../controller/setup"

type SourceCollectionRunInsert = typeof sourceCollectionRuns.$inferInsert

const RUN_TIME = new Date("2026-10-22T03:00:00.000Z")

/**
 * 収集の記録を入れる。CHECK が求める時刻（running の started_at・終わった記録の finished_at）を、渡されなければ入れる
 */
export const insertSourceCollectionRun = async (values: SourceCollectionRunInsert) => {
  const isActive = (ACTIVE_SOURCE_COLLECTION_RUN_STATUSES as readonly string[]).includes(values.status)
  const [row] = await testDb
    .insert(sourceCollectionRuns)
    .values({
      finishedAt: isActive ? null : RUN_TIME,
      startedAt: values.status === "queued" ? null : RUN_TIME,
      ...values,
    })
    .returning()
  return row
}
