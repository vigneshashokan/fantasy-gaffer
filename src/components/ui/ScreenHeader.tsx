import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.titleRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
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
    paddingTop: 52,
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
