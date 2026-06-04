import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';

interface SectionCardProps {
  title?: string;
  tk: ApexTokens;
  children: React.ReactNode;
}

export function SectionCard({ title, tk, children }: SectionCardProps) {
  return (
    <View style={styles.wrap}>
      {title && (
        <Text style={[styles.title, { color: tk.faint }]}>{title}</Text>
      )}
      <View
        style={[
          styles.card,
          { backgroundColor: tk.card, borderColor: tk.cardBorder },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});
