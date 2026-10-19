export type QuestionChoices = {
  choices: string[]
  choicesJa: string[] | null
  correctChoiceIndex: number
}

/**
 * 選択肢を Fisher–Yates で並べ替え、正解の選択肢の新しい位置を返す。選択肢の和訳も同じ順に並べ替える（null はそのまま）。
 * LLM は正解を特定の位置（B や C）に置きがちなので、保存前にコードで正解の位置を無作為にする。
 *
 * `random` は [0, 1) の乱数（task は Math.random、テストは固定した値を返す関数）
 */
export const shuffleChoices = (input: QuestionChoices, random: () => number): QuestionChoices => {
  const order = input.choices.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = current
  }
  const { choices, choicesJa } = input
  return {
    choices: order.map((originalIndex) => choices[originalIndex]),
    choicesJa: choicesJa === null ? null : order.map((originalIndex) => choicesJa[originalIndex]),
    correctChoiceIndex: order.indexOf(input.correctChoiceIndex),
  }
}
