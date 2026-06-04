import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';

interface ApplyAllCardProps {
  count: number;
  onUndo: () => void;
  onConfirm: () => void;
  tk: ApexTokens;
}

export function ApplyAllCard({ count, onUndo, onConfirm, tk }: ApplyAllCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
      onConfirm();
    }, 1150);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tk.card, borderColor: tk.green },
      ]}
    >
      <View style={[styles.headerRow, { marginBottom: confirmed ? 0 : 13 }]}>
        <View style={[styles.icon, { backgroundColor: tk.greenSoft }]}>
          <Icon
            name={confirmed ? 'check' : 'swap'}
            color={tk.green}
            size={18}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: tk.text }]}>
            {confirmed
              ? 'Changes confirmed'
              : `${count} change${count > 1 ? 's' : ''} pending`}
          </Text>
          <Text style={[styles.sub, { color: tk.faint }]}>
            {confirmed
              ? 'Your team has been updated'
              : 'Review and confirm to update your team'}
          </Text>
        </View>
      </View>

      {!confirmed && (
        <View style={styles.btnRow}>
          <Pressable
            onPress={onUndo}
            style={[styles.undoBtn, undoStyle(tk.dark)]}
          >
            <Text style={[styles.undoText, { color: tk.dark ? '#FFC04D' : '#B36B00' }]}>
              Undo all changes
            </Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmBtn, { backgroundColor: tk.green }]}
          >
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function undoStyle(dark: boolean) {
  return {
    borderColor: dark ? 'rgba(255,176,32,0.5)' : '#F0A500',
    backgroundColor: dark ? 'rgba(255,176,32,0.12)' : 'rgba(245,165,0,0.10)',
  };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
    letterSpacing: -0.15,
  },
  sub: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  undoBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13.5,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#fff',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 14,
  },
});
