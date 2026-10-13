import type { PASSAGE_SEGMENT_KINDS } from "../const/passage-segment"

/**
 * 本文のセグメントの種類
 */
export type PassageSegmentKind = (typeof PASSAGE_SEGMENT_KINDS)[number]
