import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { ApexTokens } from '@/constants/apexTokens';

const SOCIALS = [
  { key: 'instagram', label: 'Instagram', handle: '@fantasygaffer' },
  { key: 'threads',   label: 'Threads',   handle: '@fantasygaffer' },
  { key: 'x',         label: 'X',         handle: '@fantasygaffer' },
  { key: 'tiktok',    label: 'TikTok',    handle: '@fantasygaffer' },
  { key: 'bluesky',   label: 'Bluesky',   handle: '@fantasygaffer' },
] as const;

interface FollowUsRowProps {
  tk: ApexTokens;
  showDivider?: boolean;
}

export function FollowUsRow({ tk, showDivider }: FollowUsRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <View
      style={[
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.head}>
        <View style={styles.iconCell}>
          <FollowIcon color={tk.faint} />
        </View>
        <Text style={[styles.label, { color: tk.text }]}>Follow Us</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Caret color={tk.faint} />
        </View>
      </Pressable>

      {open && (
        <View>
          {SOCIALS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => {}}
              style={[styles.social, { borderTopColor: tk.line }]}
            >
              <View style={styles.iconCell}>
                <SocialIcon kind={s.key} color={tk.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.socialLabel, { color: tk.text }]}>
                  {s.label}
                </Text>
                <Text style={[styles.handle, { color: tk.faint }]}>
                  {s.handle}
                </Text>
              </View>
              <ExternalIcon color={tk.faint} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function FollowIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={10} cy={8} r={3.4} stroke={color} strokeWidth={2} />
      <Path
        d="M4 20a6 6 0 0112 0M18 8v5M20.5 10.5h-5"
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

function ExternalIcon({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 17L17 7M9 7h8v8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SocialIcon({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case 'instagram':
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Rect x={3.5} y={3.5} width={17} height={17} rx={5} stroke={color} strokeWidth={1.8} />
          <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
          <Circle cx={17} cy={7} r={1.2} fill={color} />
        </Svg>
      );
    case 'threads':
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M16 8.5c-1-1.6-2.6-2.2-4-2.2-2.8 0-4.7 2-4.7 5.7 0 3.6 1.9 5.7 4.7 5.7 2 0 3.4-1 3.7-2.7.3-1.7-.8-3-3-3-1.2 0-2.1.6-2.1 1.6 0 .8.6 1.3 1.4 1.3.9 0 1.5-.7 1.5-1.8"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'x':
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 4l14 16M19 4L5 20"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'tiktok':
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M14 4v9.5a3.5 3.5 0 11-3-3.46"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M14 4c.4 2.2 1.8 3.6 4 3.9"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'bluesky':
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 11c-1.6-3-4-5-6-5.4-1.6-.3-2 .6-2 2.2 0 2.4.4 5.6 2.4 6.4 1.3.5 3.6-.2 5.6-2.6 2 2.4 4.3 3.1 5.6 2.6 2-.8 2.4-4 2.4-6.4 0-1.6-.4-2.5-2-2.2-2 .4-4.4 2.4-6 5.4z"
            fill={color}
          />
        </Svg>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  iconCell: {
    width: 30,
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingLeft: 22,
    paddingRight: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  socialLabel: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  handle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    marginTop: 1,
  },
});
