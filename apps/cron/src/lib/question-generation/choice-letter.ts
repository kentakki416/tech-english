/**
 * 選択肢の index（0〜3）を表示の記号（A〜D）にする
 */
export const convertChoiceIndexToLetter = (choiceIndex: number): string =>
  String.fromCharCode("A".charCodeAt(0) + choiceIndex)
