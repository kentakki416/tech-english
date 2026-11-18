import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import { useState } from "react"
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * `YYYY-MM-DD` を端末のタイムゾーンの 0 時の Date にする（日付の選択は端末のローカル時刻で日付を扱うため）
 */
const convertDateStringToLocalDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const convertLocalDateToDateString = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

/**
 * 目標日の入力欄。押すと日付の選択を出す（iOS はモーダルの中のカレンダー、Android は標準のダイアログ）。
 * 目標日は空欄にできるので、日付が入っているときは横に「日付を消す」を置く。value は `YYYY-MM-DD`（空欄は ""）
 */
export function TargetDateField({ value, onChange }: { value: string, onChange: (value: string) => void }) {
  const [isIosPickerVisible, setIsIosPickerVisible] = useState(false)
  /**
   * iOS のモーダルで選んでいる途中の日付（「完了」で確定する）
   */
  const [draftDate, setDraftDate] = useState(() => new Date())

  const openPicker = () => {
    const initialDate = value ? convertDateStringToLocalDate(value) : new Date()
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) onChange(convertLocalDateToDateString(date))
        },
        value: initialDate,
      })
      return
    }
    setDraftDate(initialDate)
    setIsIosPickerVisible(true)
  }

  const confirmIosPicker = () => {
    onChange(convertLocalDateToDateString(draftDate))
    setIsIosPickerVisible(false)
  }

  return (
    <View style={styles.row}>
      {Platform.OS === "web" ? (
        /**
         * datetimepicker には web の実装が無い（何も表示しない）。開発時にブラウザで確かめるときだけ使う経路なので、
         * web では `YYYY-MM-DD` を手で入力する欄で代用する（形式は保存時の updateUserGoalRequestSchema で検証する）
         */
        <TextInput
          accessibilityLabel="目標日"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={THEME_COLORS.fgFaint}
          style={[styles.input, styles.inputText]}
          value={value}
          onChangeText={onChange}
        />
      ) : (
        <Pressable accessibilityLabel="目標日" accessibilityRole="button" style={styles.input} onPress={openPicker}>
          <Text style={value ? styles.inputText : styles.placeholder}>{value ? value.replaceAll("-", "/") : "日付を選ぶ"}</Text>
        </Pressable>
      )}
      {value !== "" && (
        <Pressable accessibilityRole="button" hitSlop={8} style={styles.clear} onPress={() => onChange("")}>
          <Text style={styles.clearText}>日付を消す</Text>
        </Pressable>
      )}

      {Platform.OS === "ios" && (
        <Modal animationType="slide" transparent visible={isIosPickerVisible} onRequestClose={() => setIsIosPickerVisible(false)}>
          <View style={styles.backdrop}>
            <View accessibilityViewIsModal style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setIsIosPickerVisible(false)}>
                  <Text style={styles.sheetCancel}>キャンセル</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.sheetTitle}>目標日</Text>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={confirmIosPicker}>
                  <Text style={styles.sheetDone}>完了</Text>
                </Pressable>
              </View>
              <DateTimePicker
                accentColor={THEME_COLORS.amber}
                display="inline"
                locale="ja-JP"
                mode="date"
                themeVariant="dark"
                value={draftDate}
                onChange={(_event, date) => {
                  if (date) setDraftDate(date)
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "flex-end",
  },
  clear: {
    paddingVertical: 10,
  },
  clearText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: THEME_COLORS.canvas,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputText: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  placeholder: {
    color: THEME_COLORS.fgFaint,
    fontSize: 15,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  sheet: {
    backgroundColor: THEME_COLORS.raised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    paddingHorizontal: 12,
  },
  sheetCancel: {
    color: THEME_COLORS.fgMuted,
    fontSize: 15,
  },
  sheetDone: {
    color: THEME_COLORS.amber,
    fontSize: 15,
    fontWeight: "600",
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  sheetTitle: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    fontWeight: "600",
  },
})
