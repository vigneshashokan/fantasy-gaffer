import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Toggle } from '@/components/ui/Toggle';
import { ApexTokens } from '@/constants/apexTokens';

const ITEMS = [
  { key: 'deadlines', label: 'Deadlines', sub: 'Gameweek deadline reminders' },
  { key: 'prices',    label: 'Price changes', sub: 'Player price rises & falls' },
  { key: 'gwConfirm', label: 'Gameweek team confirmation', sub: 'When your XI is locked in' },
  { key: 'transfer',  label: 'Transfer window open', sub: 'Window opens & closes' },
] as const;

type Key = (typeof ITEMS)[number]['key'];

interface NotificationsCardProps {
  tk: ApexTokens;
}

export function NotificationsCard({ tk }: NotificationsCardProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<Key, boolean>>({
    deadlines: true,
    prices: true,
    gwConfirm: true,
    transfer: false,
  });

  const onCount = ITEMS.filter((it) => state[it.key]).length;
  const allOn = onCount === ITEMS.length;
  const summary =
    onCount === 0 ? 'All off' : allOn ? 'All on' : `${onCount} of ${ITEMS.length} on`;

  const setAll = (v: boolean) =>
    setState({ deadlines: v, prices: v, gwConfirm: v, transfer: v });
  const setOne = (k: Key, v: boolean) =>
    setState((s) => ({ ...s, [k]: v }));

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          { backgroundColor: tk.card, borderColor: tk.cardBorder },
        ]}
      >
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.head}>
          <View style={styles.iconCell}>
            <BellIcon color={tk.faint} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.label, { color: tk.text }]}>Notifications</Text>
            <Text
              style={[
                styles.sub,
                { color: onCount === 0 ? tk.faint : tk.green },
              ]}
            >
              {summary}
            </Text>
          </View>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Caret color={tk.faint} />
          </View>
        </Pressable>

        {open && (
          <View>
            <View
              style={[
                styles.allRow,
                { borderTopColor: tk.line, backgroundColor: tk.headStrip },
              ]}
            >
              <View style={styles.iconCell} />
              <Text style={[styles.allLabel, { color: tk.text }]}>
                All notifications
              </Text>
              <Toggle
                value={allOn}
                onChange={setAll}
                onColor={tk.green}
                offColor={tk.track}
                size="sm"
              />
            </View>
            {ITEMS.map((it) => (
              <View
                key={it.key}
                style={[styles.item, { borderTopColor: tk.line }]}
              >
                <View style={styles.iconCell} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.itemLabel, { color: tk.text }]}>
                    {it.label}
                  </Text>
                  <Text style={[styles.itemSub, { color: tk.faint }]}>
                    {it.sub}
                  </Text>
                </View>
                <Toggle
                  value={state[it.key]}
                  onChange={(v) => setOne(it.key, v)}
                  onColor={tk.green}
                  offColor={tk.track}
                  size="sm"
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Caret({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCell: {
    width: 30,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  allLabel: {
    flex: 1,
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  itemLabel: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  itemSub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    marginTop: 1,
  },
});
