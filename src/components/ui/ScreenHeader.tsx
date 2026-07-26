import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  gradFrom: string;
  gradTo: string;
  children?: React.ReactNode;
  contentStyle?: ViewStyle;
}

export function ScreenHeader({
  title,
  onBack,
  gradFrom,
  gradTo,
  children,
  contentStyle,
}: ScreenHeaderProps) {
  // Was a hardcoded 52 — too much on a Touch-ID iPhone, too little on some
  // Android devices. TransferTargetsHeader already read the inset.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.titleRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Icon name="chevL" color="#fff" size={22} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {children && <View style={[styles.body, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 18,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 20,
    color: '#fff',
    letterSpacing: -0.2,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
});
