/**
 * 選択肢を Fisher–Yates で並べ替え、正解の選択肢の新しい位置を返す。
 * LLM は正解を特定の位置（B や C）に置きがちなので、保存前にコードで正解の位置を無作為にする。
 *
 * `random` は [0, 1) の乱数（task は Math.random、テストは固定した値を返す関数）
 */
export const shuffleChoices = (
  choices: string[],
  correctChoiceIndex: number,
  random: () => number,
): { choices: string[]; correctChoiceIndex: number } => {
  const order = choices.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = current
  }
  return {
    choices: order.map((originalIndex) => choices[originalIndex]),
    correctChoiceIndex: order.indexOf(correctChoiceIndex),
  }
}
