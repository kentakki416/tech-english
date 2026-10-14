import type { LearningRecordAttemptResponse } from "@repo/api-schema"

import type { Accuracy, LearningRecordAttemptView } from "../../service/learning-record-service"

/**
 * 学習記録の domain の形 → API の snake_case の形。stats と attempts（learning-record step2）で共有する
 */

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
