import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface PointPillProps {
  pts?: number | null;
  name: string;
  upcoming?: boolean;
  maxWidth?: number;
}

export function PointPill({ pts, name, upcoming = false, maxWidth = 96 }: PointPillProps) {
  const played = pts != null;
  const numBg = played ? '#7B09E5' : 'rgba(255,255,255,0.22)';
  return (
    <View style={[styles.container, { maxWidth }]}>
      {!upcoming && (
        <View style={[styles.num, { backgroundColor: numBg }]}>
          <Text style={styles.numText}>{played ? String(pts) : '–'}</Text>
        </View>
      )}
      <Text style={[styles.name, { color: played || upcoming ? '#fff' : '#C4CAD6' }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgb(19,27,46)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  num: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 10.5,
    color: '#fff',
  },
  name: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    letterSpacing: -0.12,
  },
});
