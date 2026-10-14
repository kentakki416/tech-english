import { Modal, Pressable, StyleSheet, Text, View } from "react-native"

import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * 提出の確認。RN の Modal（transparent）の上のダイアログで、「提出する」を上、「戻って回答する」を下に縦に並べる。
 * 未回答があれば件数と「不正解として採点」を伝える。送信中は両方のボタンを無効にし、
 * 失敗したらダイアログの中に理由を出す（web と同じ。回答は端末に残っているので再送できる）
 */
export function SubmitConfirmModal({
  errorMessage,
  isSubmitting,
  isVisible,
  unansweredCount,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null
  isSubmitting: boolean
  isVisible: boolean
  unansweredCount: number
  onCancel: () => void
  onSubmit: () => void
}) {
  const hasUnanswered = unansweredCount > 0
  return (
    <Modal
      animationType="fade"
      transparent
      visible={isVisible}
      onRequestClose={() => {
        if (!isSubmitting) onCancel()
      }}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.title}>
            {hasUnanswered ? `未回答の設問が ${unansweredCount} 問あります` : "回答を提出しますか？"}
          </Text>
          <Text style={styles.text}>
            {hasUnanswered ? "未回答の設問は不正解として採点されます。" : ""}提出すると回答は変更できません。
          </Text>
          {errorMessage !== null && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
          <View style={styles.submit}>
            <PrimaryButton isDisabled={isSubmitting} label={isSubmitting ? "提出しています…" : "提出する"} onPress={onSubmit} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            disabled={isSubmitting}
            style={[styles.cancel, isSubmitting && styles.disabled]}
            onPress={onCancel}
          >
            <Text style={styles.cancelText}>{hasUnanswered ? "戻って回答する" : "戻る"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  dialog: {
    backgroundColor: THEME_COLORS.raised,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    padding: 22,
    width: "100%",
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    color: THEME_COLORS.wrong,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  submit: {
    marginTop: 20,
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 17,
    fontWeight: "600",
  },
})
