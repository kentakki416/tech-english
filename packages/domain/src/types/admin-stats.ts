import type { ADMIN_PASSAGE_STATS_SORTS, ADMIN_STATS_PERIODS } from "../const/admin-stats"

export type AdminStatsPeriod = (typeof ADMIN_STATS_PERIODS)[number]

export type AdminPassageStatsSort = (typeof ADMIN_PASSAGE_STATS_SORTS)[number]
