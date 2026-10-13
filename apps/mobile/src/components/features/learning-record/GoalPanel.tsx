import { Pressable, StyleSheet, Text, View } from "react-native"

import type { GetUserStatsResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"

type GoalProgress = NonNullable<GetUserStatsResponse["goal"]>

/**
 * 週の目標の線を目標値の数だけ並べる上限（問題数のとき）。超えたら 1 本の線を進捗の割合で塗る（web と同じ）
 */
const SEGMENTED_TARGET_MAX = 10

/**
 * どの項目も空なら目標が無いのと同じに扱う（設定画面ですべて空欄にして保存した場合）
 */
const hasGoalContent = (goal: GoalProgress): boolean =>
  goal.goal_text !== null || goal.target_date !== null || goal.weekly_metric !== null

/**
 * 今週の進捗（`3 / 5 問` と線、達成までの残り）。週の目標が無ければ出さない
 */
function WeeklyProgress({ goal }: { goal: GoalProgress }) {
  const { is_weekly_achieved: isAchieved, weekly_metric: metric, weekly_progress: progress, weekly_target: target } = goal
  if (metric === null || target === null || progress === null) return null

  const unit = metric === "passages" ? "問" : "分"
  const isSegmented = metric === "passages" && target <= SEGMENTED_TARGET_MAX

  return (
    <>
      <View style={styles.weekHeader}>
        <Text style={appStyles.caption}>今週</Text>
        <Text style={styles.weekValue}>{progress} / {target} {unit}</Text>
      </View>
      {isSegmented ? (
        <View style={styles.weekBars}>
          {Array.from({ length: target }, (_, index) => (
            <View key={index} style={[styles.weekBar, { backgroundColor: index < progress ? THEME_COLORS.amber : THEME_COLORS.heat0 }]} />
          ))}
        </View>
      ) : (
        <View style={styles.weekTrack}>
          <View style={[styles.weekFill, { width: `${Math.min(progress / target, 1) * 100}%` }]} />
        </View>
      )}
      <Text style={[styles.faintText, isAchieved && styles.achieved]}>
        {isAchieved ? "今週の目標を達成しました。" : `あと ${target - progress} ${unit}で今週の目標を達成します。`}
      </Text>
    </>
  )
}

/**
 * 目標のパネル。値のある項目だけ出し、目標が無ければ設定を促す。「編集」「目標を設定する」で設定タブへ
 */
export function GoalPanel({ goal, onEdit }: { goal: GetUserStatsResponse["goal"], onEdit: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <Text style={appStyles.caption}>目標</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onEdit}>
          <Text style={appStyles.caption}>編集</Text>
        </Pressable>
      </View>
      {goal === null || !hasGoalContent(goal) ? (
        <>
          <Text style={styles.faintText}>目標はまだありません。</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onEdit}>
            <Text style={styles.link}>目標を設定する</Text>
          </Pressable>
        </>
      ) : (
        <>
          {goal.goal_text !== null && <Text style={styles.goalText}>{goal.goal_text}</Text>}
          {goal.target_date !== null && (
            <Text style={[appStyles.caption, styles.targetDate]}>
              {goal.target_date.replaceAll("-", "/")} まで{" "}
              <Text style={styles.daysLeft}>
                {goal.days_left !== null && goal.days_left >= 0 ? `あと ${goal.days_left} 日` : "目標日を過ぎています"}
              </Text>
            </Text>
          )}
          <WeeklyProgress goal={goal} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  achieved: {
    color: THEME_COLORS.amber,
  },
  daysLeft: {
    color: THEME_COLORS.fg,
  },
  faintText: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 8,
  },
  goalText: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  link: {
    color: THEME_COLORS.amber,
    fontSize: 14,
    marginTop: 10,
  },
  rowBetween: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  section: {
    padding: 16,
  },
  targetDate: {
    marginTop: 4,
  },
  weekBar: {
    borderRadius: 3,
    flex: 1,
    height: 6,
  },
  weekBars: {
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
  },
  weekFill: {
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 3,
    height: 6,
  },
  weekHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  weekTrack: {
    backgroundColor: THEME_COLORS.heat0,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
  },
  weekValue: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
})
