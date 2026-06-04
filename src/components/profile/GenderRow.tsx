import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';

const OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

interface GenderRowProps {
  value: string;
  onChange: (v: string) => void;
  tk: ApexTokens;
}

export function GenderRow({ value, onChange, tk }: GenderRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.wrap, { borderTopColor: tk.line }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.head}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: tk.faint }]}>Gender</Text>
          <Text style={[styles.value, { color: tk.text }]}>{value}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Caret color={tk.faint} />
        </View>
      </Pressable>
      {open && (
        <View style={styles.list}>
          {OPTIONS.map((o) => {
            const on = o === value;
            return (
              <Pressable
                key={o}
                onPress={() => {
                  onChange(o);
                  setOpen(false);
                }}
                style={[
                  styles.opt,
                  on && { backgroundColor: tk.rowSel },
                ]}
              >
                <Text
                  style={[
                    styles.optText,
                    {
                      color: tk.text,
                      fontFamily: on ? 'Archivo_700Bold' : 'Archivo_500Medium',
                    },
                  ]}
                >
                  {o}
                </Text>
                {on && <Icon name="check" color={tk.green} size={17} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
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
    borderTopWidth: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.74,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15.5,
    marginTop: 3,
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
  },
  optText: {
    fontSize: 14.5,
  },
});
