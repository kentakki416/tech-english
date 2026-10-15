import type { ADMIN_PASSAGE_STATS_SORTS, ADMIN_STATS_PERIODS } from "../const/admin-stats"

/**
 * admin のダッシュボードの期間
 */
export type AdminStatsPeriod = (typeof ADMIN_STATS_PERIODS)[number]

/**
 * 問題ごとの成績の並べ替えの列
 */
export type AdminPassageStatsSort = (typeof ADMIN_PASSAGE_STATS_SORTS)[number]
