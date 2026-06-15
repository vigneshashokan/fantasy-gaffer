import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import type { Position } from '@/types/fpl';

const PLURAL: Record<Position, string> = {
  GKP: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
};

interface TransferTargetsHeaderProps {
  pos: Position;
  nextGw: number;
  gradFrom: string;
  gradTo: string;
  onBack: () => void;
}

export function TransferTargetsHeader({ pos, nextGw, gradFrom, gradTo, onBack }: TransferTargetsHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.row}>
        <Pressable testID="tt-header-back" onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevL" color="#fff" size={22} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>Transfer {PLURAL[pos]}</Text>
          <Text style={styles.sub} numberOfLines={1}>Top targets for GW{nextGw}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Archivo_800ExtraBold', fontSize: 22, color: '#fff', letterSpacing: -0.4 },
  sub: { fontFamily: 'Archivo_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
