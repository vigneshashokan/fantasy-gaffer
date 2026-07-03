import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';
import type { LegalDoc } from '@/content/legal';

export function LegalDocView({ doc, tk }: { doc: LegalDoc; tk: ApexTokens }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.updated, { color: tk.faint }]}>
        Last updated {doc.lastUpdated}
      </Text>

      {doc.intro ? (
        <Text style={[styles.paragraph, { color: tk.variant }]}>{doc.intro}</Text>
      ) : null}

      {doc.sections.map((section, si) => (
        <View key={si} style={styles.section}>
          <Text style={[styles.heading, { color: tk.text }]}>{section.heading}</Text>
          {section.blocks.map((block, bi) =>
            block.type === 'paragraph' ? (
              <Text key={bi} style={[styles.paragraph, { color: tk.variant }]}>
                {block.text}
              </Text>
            ) : (
              <View key={bi} style={styles.bullets}>
                {block.items.map((item, ii) => (
                  <View key={ii} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: tk.faint }]}>•</Text>
                    <Text style={[styles.bulletText, { color: tk.variant }]}>{item}</Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 },
  updated: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
    marginBottom: 14,
  },
  section: { marginBottom: 20 },
  heading: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  bullets: { marginTop: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bulletDot: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    lineHeight: 21,
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
});
