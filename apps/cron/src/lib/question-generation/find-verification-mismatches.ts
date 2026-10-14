import { convertChoiceIndexToLetter } from "./choice-letter"

/**
 * 解答キーを見ない検証の回答を正解と突き合わせる。
 * 設問ごとに検証モデルが選んだ選択肢（回答が無い設問は null）と、食い違った設問の要確認の理由「Q3：検証モデルは A を選択（正解は B）」を返す
 *
 * questionNumber は 1 始まり（設問の配列の index + 1）
 */
export const findVerificationMismatches = (
  questions: { correctChoiceIndex: number }[],
  answers: { choiceIndex: number; questionNumber: number }[],
): { attentionReasons: string[]; verificationChoiceIndexes: (number | null)[] } => {
  const choiceIndexByQuestionNumber = new Map(answers.map((answer) => [answer.questionNumber, answer.choiceIndex]))
  const attentionReasons: string[] = []
  const verificationChoiceIndexes = questions.map((question, index) => {
    const choiceIndex = choiceIndexByQuestionNumber.get(index + 1)
    if (choiceIndex === undefined) return null
    if (choiceIndex !== question.correctChoiceIndex) {
      attentionReasons.push(
        `Q${index + 1}：検証モデルは ${convertChoiceIndexToLetter(choiceIndex)} を選択（正解は ${convertChoiceIndexToLetter(question.correctChoiceIndex)}）`,
      )
    }
    return choiceIndex
  })
  return { attentionReasons, verificationChoiceIndexes }
}
