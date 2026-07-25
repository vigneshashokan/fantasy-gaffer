import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { isSupported as biometricIsSupported } from '@/lib/auth/biometric/capability';
import { useBiometricStore } from '@/store/biometricStore';

interface BiometricCardProps {
  tk: ApexTokens;
}

export function BiometricCard({ tk }: BiometricCardProps) {
  const enabled = useBiometricStore((s) => s.enabled);
  const enable = useBiometricStore((s) => s.enable);
  const disable = useBiometricStore((s) => s.disable);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    biometricIsSupported().then((v) => {
      if (!cancelled) setSupported(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          { backgroundColor: tk.card, borderColor: tk.cardBorder },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.iconCell}>
            <Icon name="faceid" color={tk.faint} size={20} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.label, { color: tk.text }]}>Face ID login</Text>
            <Text style={[styles.sub, { color: tk.faint }]}>
              {enabled ? 'Face ID required to open the app' : 'App opens without Face ID'}
            </Text>
          </View>
          <Toggle
            value={enabled}
            onChange={(v) => (v ? enable() : disable())}
            onColor={tk.green}
            offColor={tk.track}
            accessibilityLabel="Face ID login"
          />
        </View>
      </View>
    </View>
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
  row: {
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
});
