import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

interface PushPrimingSheetProps {
  visible: boolean;
  onEnable: () => void;
  onLater: () => void;
  tk: ApexTokens;
}

const TYPES = [
  'Deadline reminders before each gameweek',
  'Price rises & falls on your players',
  'Your XI confirmed at the deadline',
  'Transfer window opens',
];

export function PushPrimingSheet({ visible, onEnable, onLater, tk }: PushPrimingSheetProps) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: tk.card, borderColor: tk.cardBorder }]}>
          <Text style={[styles.title, { color: tk.text }]}>Stay ahead of your gameweek</Text>
          <Text style={[styles.sub, { color: tk.faint }]}>
            Turn on notifications so Fantasy Gaffer can nudge you about:
          </Text>
          <View style={styles.list}>
            {TYPES.map((t) => (
              <View key={t} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: tk.green }]} />
                <Text style={[styles.item, { color: tk.text }]}>{t}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={onEnable} style={[styles.enable, { backgroundColor: tk.activeFill }]}>
            <Text style={styles.enableText}>Enable notifications</Text>
          </Pressable>
          <Pressable onPress={onLater} style={styles.later} hitSlop={8}>
            <Text style={[styles.laterText, { color: tk.faint }]}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 36 },
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 20, letterSpacing: -0.4 },
  sub: { fontFamily: 'Archivo_500Medium', fontSize: 14, marginTop: 8, lineHeight: 20 },
  list: { marginTop: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  item: { fontFamily: 'Archivo_600SemiBold', fontSize: 14.5, flex: 1 },
  enable: { marginTop: 24, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  enableText: { color: '#fff', fontFamily: 'Archivo_700Bold', fontSize: 16 },
  later: { marginTop: 14, alignItems: 'center' },
  laterText: { fontFamily: 'Archivo_600SemiBold', fontSize: 14 },
});
