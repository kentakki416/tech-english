import { useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"

import { type GetUserGoalResponse, updateUserGoalRequestSchema } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { Segment } from "@/components/ui/Segment"
import { THEME_COLORS } from "@/const/design-theme"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"

import { TargetDateField } from "./TargetDateField"

type Goal = GetUserGoalResponse["goal"]

type GoalMetric = NonNullable<NonNullable<Goal>["weekly_metric"]>

type WeeklyMetricOption = "none" | GoalMetric

type SaveState =
  | { kind: "error", message: string }
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "saving" }

const METRIC_OPTIONS: { key: WeeklyMetricOption, label: string }[] = [
  { key: "none", label: "設定しない" },
  { key: "passages", label: "問題数" },
  { key: "minutes", label: "学習時間" },
]

/**
 * 指標を選んだときの週の目標値の初期値（保存済みの指標と同じならその値。web と同じ）
 */
const DEFAULT_WEEKLY_TARGETS: Record<GoalMetric, number> = {
  minutes: 60,
  passages: 5,
}

/**
 * 目標の文字数の上限（API の検証と同じ。超えたら文字数を wrong で出す）
 */
const GOAL_TEXT_MAX = 200

const resolveWeeklyTarget = (goal: Goal, metric: GoalMetric): string =>
  String(goal?.weekly_metric === metric && goal.weekly_target !== null ? goal.weekly_target : DEFAULT_WEEKLY_TARGETS[metric])

/**
 * 空欄・空白だけの入力は null にする（API は空文字を受け付けない）
 */
const convertBlankToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim())

/**
 * 目標のフォーム（目標・目標日・週の目標）。初期値は親が取得した目標（null なら空と「設定しない」）。
 * 「目標を保存」で本文を組み立てて検証し、PUT /api/user/goal で保存する
 */
export function GoalForm({ goal }: { goal: Goal }) {
  const [goalText, setGoalText] = useState(goal?.goal_text ?? "")
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "")
  const [metric, setMetric] = useState<WeeklyMetricOption>(goal?.weekly_metric ?? "none")
  const [weeklyTarget, setWeeklyTarget] = useState(goal?.weekly_metric ? resolveWeeklyTarget(goal, goal.weekly_metric) : "")
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const isSaving = saveState.kind === "saving"

  /**
   * 保存後に入力を変えたら「目標を保存しました」とエラーを消す
   */
  const markEdited = () => {
    if (!isSaving) setSaveState({ kind: "idle" })
  }

  const changeMetric = (next: WeeklyMetricOption) => {
    if (next !== metric && next !== "none") setWeeklyTarget(resolveWeeklyTarget(goal, next))
    setMetric(next)
    markEdited()
  }

  const saveGoal = async () => {
    const parsed = updateUserGoalRequestSchema.safeParse({
      goal_text: convertBlankToNull(goalText),
      target_date: convertBlankToNull(targetDate),
      weekly_metric: metric === "none" ? null : metric,
      weekly_target: metric === "none" ? null : Number(weeklyTarget),
    })
    if (!parsed.success) {
      setSaveState({ kind: "error", message: "入力内容を確認してください。" })
      return
    }

    setSaveState({ kind: "saving" })
    try {
      const saved = await learningRecordApi.saveGoal(parsed.data)
      /**
       * 前後の空白を除いた保存後の値に揃える
       */
      setGoalText(saved.goal.goal_text ?? "")
      setTargetDate(saved.goal.target_date ?? "")
      setSaveState({ kind: "saved" })
    } catch (error) {
      console.warn("Failed to save goal:", error)
      setSaveState({ kind: "error", message: "保存に失敗しました。時間をおいて再度お試しください。" })
    }
  }

  return (
    <View style={appStyles.card}>
      <View style={styles.body}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>目標</Text>
          <Text style={[styles.counter, goalText.length > GOAL_TEXT_MAX && styles.counterOver]}>{goalText.length} / {GOAL_TEXT_MAX}</Text>
        </View>
        <TextInput
          accessibilityLabel="目標"
          multiline
          placeholder="例：英語の公式ドキュメントを辞書なしで読めるようになる"
          placeholderTextColor={THEME_COLORS.fgFaint}
          style={[styles.input, styles.textArea]}
          value={goalText}
          onChangeText={(value) => {
            setGoalText(value)
            markEdited()
          }}
        />

        <Text style={[styles.label, styles.fieldGap]}>目標日</Text>
        <TargetDateField
          value={targetDate}
          onChange={(value) => {
            setTargetDate(value)
            markEdited()
          }}
        />

        <Text style={[styles.label, styles.fieldGap]}>週の目標</Text>
        <Text style={styles.hint}>週は月曜日から始まります。</Text>
        <View style={styles.segment}>
          <Segment options={METRIC_OPTIONS} value={metric} onChange={changeMetric} />
        </View>
        {metric !== "none" && (
          <View style={styles.weeklyRow}>
            <Text style={styles.hint}>週に</Text>
            <TextInput
              accessibilityLabel="週の目標値"
              keyboardType="number-pad"
              style={[styles.input, styles.numberInput]}
              value={weeklyTarget}
              onChangeText={(value) => {
                setWeeklyTarget(value)
                markEdited()
              }}
            />
            <Text style={styles.hint}>{metric === "passages" ? "問" : "分"}</Text>
          </View>
        )}

        <View style={styles.submit}>
          <PrimaryButton isDisabled={isSaving} label={isSaving ? "保存しています…" : "目標を保存"} onPress={() => void saveGoal()} />
        </View>
        {saveState.kind === "saved" && <Text accessibilityLiveRegion="polite" style={styles.saved}>目標を保存しました</Text>}
        {saveState.kind === "error" && <Text accessibilityLiveRegion="polite" style={styles.error}>{saveState.message}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
  },
  counter: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  counterOver: {
    color: THEME_COLORS.wrong,
  },
  error: {
    color: THEME_COLORS.wrong,
    fontSize: 13,
    marginTop: 8,
  },
  fieldGap: {
    marginTop: 16,
  },
  hint: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  input: {
    backgroundColor: THEME_COLORS.canvas,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: THEME_COLORS.fg,
    fontSize: 15,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    color: THEME_COLORS.fg,
    fontSize: 14,
  },
  numberInput: {
    marginTop: 0,
    textAlign: "right",
    width: 72,
  },
  rowBetween: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  saved: {
    color: THEME_COLORS.correct,
    fontSize: 13,
    marginTop: 8,
  },
  segment: {
    marginTop: 8,
  },
  submit: {
    marginTop: 18,
  },
  textArea: {
    lineHeight: 22,
    minHeight: 76,
    textAlignVertical: "top",
  },
  weeklyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
})
