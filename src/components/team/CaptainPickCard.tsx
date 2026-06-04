import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Kit } from '@/components/ui/Kit';
import { Icon } from '@/components/ui/Icon';
import { ApplyCheckbox } from '@/components/ui/ApplyCheckbox';
import { CaptainPick } from '@/constants/data';
import { ApexTokens } from '@/constants/apexTokens';

interface CaptainPickCardProps {
  picks: CaptainPick[];
  captainApplied: string;
  tk: ApexTokens;
  editable?: boolean;
  pendingCaptain?: string;
  onPick?: (name: string) => void;
}

export function CaptainPickCard({
  picks,
  captainApplied,
  tk,
  editable = false,
  pendingCaptain,
  onPick,
}: CaptainPickCardProps) {
  const current = editable && pendingCaptain ? pendingCaptain : captainApplied;
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tk.card, borderColor: tk.cardBorder, opacity: editable ? 1 : 0.72 },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: tk.text }]}>Captain Pick</Text>
        {!editable && (
          <View
            style={[
              styles.lockedBadge,
              { backgroundColor: tk.headStrip, borderColor: tk.cardBorder },
            ]}
          >
            <Icon name="lock" color={tk.faint} size={11} />
            <Text style={[styles.lockedText, { color: tk.faint }]}>Locked</Text>
          </View>
        )}
      </View>

      {picks.map((p, i) => {
        const isTop = i === 0;
        const isOn = current === p.name;
        const RowTag = editable ? Pressable : View;
        return (
          <RowTag
            key={p.name}
            onPress={editable ? () => onPick?.(p.name) : undefined}
            style={[
              styles.row,
              {
                backgroundColor: isOn ? tk.greenSoft : isTop ? tk.headStrip : 'transparent',
                borderColor: isOn ? tk.green : isTop ? tk.cardBorder : 'transparent',
                marginTop: i === 0 ? 0 : 8,
              },
            ]}
          >
            <View style={{ position: 'relative' }}>
              <Kit club={p.club} size={36} />
              {isOn && (
                <View style={[styles.captBadge, { backgroundColor: tk.activeFill, borderColor: tk.card }]}>
                  <Text style={styles.captBadgeText}>C</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: tk.text, fontFamily: isTop ? 'Archivo_800ExtraBold' : 'Archivo_600SemiBold' }]}>
                  {p.name}
                </Text>
                {isTop && (
                  <View style={[styles.topPickBadge, { backgroundColor: tk.pink }]}>
                    <Text style={styles.topPickText}>TOP PICK</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.note, { color: tk.faint }]}>{p.note}</Text>
            </View>
            <Text style={[styles.xp, { color: isTop ? tk.green : tk.text }]}>
              {p.xp.toFixed(1)}
              <Text style={[styles.xpLabel, { color: tk.faint }]}> xPts</Text>
            </Text>
            {editable && (
              <ApplyCheckbox
                checked={isOn}
                onChange={(v) => v && onPick?.(p.name)}
                green={tk.green}
                border={tk.cardBorder}
              />
            )}
          </RowTag>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 17,
    letterSpacing: -0.17,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  lockedText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  captBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  captBadgeText: {
    color: '#fff',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 10,
    lineHeight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  name: {
    fontSize: 15.5,
    letterSpacing: -0.16,
  },
  topPickBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  topPickText: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 9,
    letterSpacing: 0.54,
    color: '#fff',
  },
  note: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 3,
  },
  xp: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 14,
  },
  xpLabel: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 10,
  },
});
