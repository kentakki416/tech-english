import { Ionicons } from "@expo/vector-icons"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { ResultQuestion } from "@repo/api-schema"

import { QUESTION_TYPE_LABELS } from "@/components/features/passage/labels"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

const CHOICE_LETTERS = ["A", "B", "C", "D"]

type ResultQuestionItemProps = {
  /**
   * この設問の根拠を本文でハイライトしているか
   */
  isHighlighted: boolean
  isOpen: boolean
  /**
   * 1 から始まる設問の番号
   */
  number: number
  question: ResultQuestion
  onShowEvidence: (question: ResultQuestion) => void
  onToggle: (questionId: number) => void
}

/**
 * 選択肢の 1 行。正解はミントの枠と「正解」、選んだ選択肢は「あなたの回答」（誤りならローズの枠）
 */
function ChoiceRow({
  choice,
  index,
  isCorrectChoice,
  isUserChoice,
}: {
  choice: string
  index: number
  isCorrectChoice: boolean
  isUserChoice: boolean
}) {
  const isWrongChoice = isUserChoice && !isCorrectChoice
  return (
    <View style={[styles.choice, isCorrectChoice && styles.choiceCorrect, isWrongChoice && styles.choiceWrong]}>
      <Text style={[styles.choiceLetter, isCorrectChoice && styles.choiceLetterCorrect, isWrongChoice && styles.choiceLetterWrong]}>
        {CHOICE_LETTERS[index]}
      </Text>
      <Text style={[styles.choiceText, !isCorrectChoice && !isUserChoice && styles.choiceTextMuted]}>{choice}</Text>
      <View style={styles.choiceLabels}>
        {isCorrectChoice && <Text style={[styles.choiceLabel, styles.correctText]}>正解</Text>}
        {isUserChoice && <Text style={[styles.choiceLabel, isCorrectChoice ? styles.correctText : styles.wrongText]}>あなたの回答</Text>}
      </View>
    </View>
  )
}

/**
 * 設問ごとの結果の 1 件。番号・種類のバッジ・正誤の行を押すと開閉し、開くと設問文・選択肢・解説・「本文の根拠を見る」を出す。
 * 根拠が本文に見つからなかった設問（evidence が null）はボタンを出さない
 */
export function ResultQuestionItem({ isHighlighted, isOpen, number, question, onShowEvidence, onToggle }: ResultQuestionItemProps) {
  const isUnanswered = question.selected_choice_index === null
  return (
    <View style={styles.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        style={styles.header}
        onPress={() => onToggle(question.id)}
      >
        <View style={[styles.square, question.is_correct ? styles.squareCorrect : styles.squareWrong]} />
        <Text style={styles.number}>Q{number}</Text>
        <Text style={styles.typeBadge}>{QUESTION_TYPE_LABELS[question.type]}</Text>
        <Text style={[styles.verdict, question.is_correct ? styles.correctText : styles.wrongText]}>
          {question.is_correct ? "正解" : isUnanswered ? "未回答" : "不正解"}
        </Text>
        <Ionicons color={THEME_COLORS.fgFaint} name={isOpen ? "chevron-up" : "chevron-down"} size={16} style={styles.chevron} />
      </Pressable>

      {isOpen && (
        <View style={styles.body}>
          <Text style={styles.prompt}>{question.prompt}</Text>
          {question.choices.map((choice, choiceIndex) => (
            <ChoiceRow
              key={choiceIndex}
              choice={choice}
              index={choiceIndex}
              isCorrectChoice={choiceIndex === question.correct_choice_index}
              isUserChoice={choiceIndex === question.selected_choice_index}
            />
          ))}
          <Text style={styles.explanation}>{question.explanation_ja}</Text>
          {question.evidence !== null && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isHighlighted }}
              style={[styles.evidenceButton, isHighlighted && styles.evidenceButtonActive]}
              onPress={() => onShowEvidence(question)}
            >
              <Text style={[styles.evidenceText, isHighlighted && styles.evidenceTextActive]}>
                {isHighlighted ? "● 本文で根拠を表示中" : "● 本文の根拠を見る"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    marginTop: 10,
  },
  chevron: {
    marginLeft: "auto",
  },
  choice: {
    alignItems: "flex-start",
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    padding: 10,
  },
  choiceCorrect: {
    backgroundColor: THEME_COLORS.correctWash,
    borderColor: "rgba(111, 202, 163, 0.5)",
  },
  choiceLabel: {
    fontSize: 11,
  },
  choiceLabels: {
    alignItems: "flex-end",
  },
  choiceLetter: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.fgFaint,
    fontFamily: THEME_FONTS.code,
    fontSize: 11,
    height: 20,
    lineHeight: 18,
    overflow: "hidden",
    textAlign: "center",
    width: 20,
  },
  choiceLetterCorrect: {
    backgroundColor: THEME_COLORS.correct,
    borderColor: THEME_COLORS.correct,
    color: THEME_COLORS.canvas,
  },
  choiceLetterWrong: {
    backgroundColor: THEME_COLORS.wrong,
    borderColor: THEME_COLORS.wrong,
    color: THEME_COLORS.canvas,
  },
  choiceText: {
    color: THEME_COLORS.fg,
    flex: 1,
    fontFamily: THEME_FONTS.reading,
    fontSize: 15,
    lineHeight: 21,
  },
  choiceTextMuted: {
    color: THEME_COLORS.fgMuted,
  },
  choiceWrong: {
    backgroundColor: THEME_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.5)",
  },
  correctText: {
    color: THEME_COLORS.correct,
  },
  evidenceButton: {
    alignSelf: "flex-start",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  evidenceButtonActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  evidenceText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
  },
  evidenceTextActive: {
    color: THEME_COLORS.amber,
  },
  explanation: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    lineHeight: 25,
    marginTop: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  item: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  number: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    fontWeight: "600",
  },
  prompt: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 16,
    lineHeight: 24,
  },
  square: {
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  squareCorrect: {
    backgroundColor: THEME_COLORS.correct,
  },
  squareWrong: {
    backgroundColor: THEME_COLORS.wrongWash,
    borderColor: THEME_COLORS.wrong,
    borderWidth: 1,
  },
  typeBadge: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  verdict: {
    fontSize: 14,
  },
  wrongText: {
    color: THEME_COLORS.wrong,
  },
})
