import type {
  GetUserAttemptsResponse,
  GetUserCalendarResponse,
  GetUserStatsResponse,
  LearningRecordAttemptResponse,
} from "@repo/api-schema"

import type {
  Accuracy,
  LearningRecordAttemptView,
  UserAttempts,
  UserCalendar,
  UserStats,
} from "../../service/learning-record-service"

export const convertAccuracyToResponse = (accuracy: Accuracy) => ({
  accuracy_percent: accuracy.accuracyPercent,
  correct_count: accuracy.correctCount,
  question_count: accuracy.questionCount,
})

export const convertLearningRecordAttemptToResponse = (attempt: LearningRecordAttemptView): LearningRecordAttemptResponse => ({
  id: attempt.id,
  correct_count: attempt.correctCount,
  elapsed_seconds: attempt.elapsedSeconds,
  is_overtime: attempt.isOvertime,
  passage_id: attempt.passageId,
  question_count: attempt.questionCount,
  study_date: attempt.studyDate,
  submitted_at: attempt.submittedAt.toISOString(),
  submitted_time: attempt.submittedTime,
  title: attempt.title,
  used_assist: attempt.usedAssist,
})

export const convertUserStatsToResponse = (stats: UserStats): GetUserStatsResponse => ({
  goal: stats.goal === null
    ? null
    : {
      days_left: stats.goal.daysLeft,
      goal_text: stats.goal.goalText,
      is_weekly_achieved: stats.goal.isWeeklyAchieved,
      target_date: stats.goal.targetDate,
      weekly_metric: stats.goal.weeklyMetric,
      weekly_progress: stats.goal.weeklyProgress,
      weekly_target: stats.goal.weeklyTarget,
    },
  no_assist: convertAccuracyToResponse(stats.noAssist),
  recent_attempts: stats.recentAttempts.map(convertLearningRecordAttemptToResponse),
  streak: {
    current: stats.streak.current,
    longest: stats.streak.longest,
    recent_days: stats.streak.recentDays.map((day) => ({ date: day.date, has_studied: day.hasStudied })),
  },
  today: stats.today,
  totals: {
    ...convertAccuracyToResponse(stats.totals),
    attempt_count: stats.totals.attemptCount,
    passage_count: stats.totals.passageCount,
    study_seconds: stats.totals.studySeconds,
  },
  type_accuracy: stats.typeAccuracy.map((accuracy) => ({ ...convertAccuracyToResponse(accuracy), type: accuracy.type })),
  weakest_question_type: stats.weakestQuestionType,
})

export const convertUserCalendarToResponse = (calendar: UserCalendar): GetUserCalendarResponse => ({
  days: calendar.days.map((day) => ({
    attempt_count: day.attemptCount,
    card_count: day.cardCount,
    correct_count: day.correctCount,
    date: day.date,
    level: day.level,
    question_count: day.questionCount,
    remembered_count: day.rememberedCount,
    study_seconds: day.studySeconds,
  })),
  from: calendar.from,
  to: calendar.to,
  today: calendar.today,
})

export const convertUserAttemptsToResponse = (page: UserAttempts): GetUserAttemptsResponse => ({
  attempts: page.attempts.map(convertLearningRecordAttemptToResponse),
  next_cursor: page.nextCursor,
})
