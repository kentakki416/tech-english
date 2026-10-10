import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { mockStyles, ScoreSquares } from "@/components/mock/parts"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import { formatSeconds, MOCK_ATTEMPT_HISTORY } from "@/libs/mock-data"

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDateHeading = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCFullYear()}年${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

const SECTIONS = Array.from(new Set(MOCK_ATTEMPT_HISTORY.map(attempt => attempt.date))).map(date => ({
  data: MOCK_ATTEMPT_HISTORY.filter(attempt => attempt.date === date),
  title: formatDateHeading(date),
}))

/**
 * 学習履歴（モック）。マイページの「すべて見る」から開く
 */
export default function MockHistoryScreen() {
  const router = useRouter()
  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()} style={styles.back}>
          <Ionicons color={MOCK_COLORS.fgMuted} name="chevron-back" size={18} />
          <Text style={styles.backText}>マイページ</Text>
        </Pressable>
        <Text style={styles.title}>学習履歴</Text>
        <View style={{ width: 80 }} />
      </View>
      <SectionList
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push("/mock/attempts/42/result")} style={styles.row}>
            <Text style={styles.time}>{item.submittedTime}</Text>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
              <View style={styles.rowMeta}>
                <ScoreSquares results={Array.from({ length: item.questionCount }, (_, index) => index < item.correctCount)} />
                <Text style={styles.metaText}>{item.correctCount}/{item.questionCount}</Text>
                <Text style={[styles.metaText, item.isOvertime && { color: MOCK_COLORS.wrong }]}>
                  {formatSeconds(item.elapsedSeconds)}{item.isOvertime ? " 超過" : ""}
                </Text>
                <Text style={styles.faint}>{item.assistUsed ? "アシストあり" : "アシストなし"}</Text>
              </View>
            </View>
          </Pressable>
        )}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        sections={SECTIONS}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
    width: 80,
  },
  backText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  faint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    marginLeft: "auto",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  metaText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  row: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  rowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 5,
  },
  rowTitle: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 16,
  },
  sectionHeader: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    paddingBottom: 6,
    paddingTop: 22,
  },
  time: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
    paddingTop: 3,
    width: 40,
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
})
