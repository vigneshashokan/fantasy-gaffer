import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ApexTokens } from '@/constants/apexTokens';
import { useAuthStore } from '@/store/authStore';
import { requestDeletion } from '@/lib/auth/account-deletion';

interface DeleteAccountProps {
  tk: ApexTokens;
}

export function DeleteAccount({ tk }: DeleteAccountProps) {
  const sessionEmail = useAuthStore((s) => s.session?.user.email ?? '');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches =
    sessionEmail.length > 0 &&
    typed.trim().toLowerCase() === sessionEmail.toLowerCase();

  const onDelete = async () => {
    if (!matches || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await requestDeletion();
      if (!r.ok) {
        setError("Couldn't request deletion. Please try again.");
      }
      // On ok: signOut has fired inside requestDeletion, so
      // (home)/_layout will redirect us out of Profile.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {!confirm ? (
        <Pressable
          onPress={() => setConfirm(true)}
          style={[styles.openBtn, { borderColor: tk.pink }]}
        >
          <BinIcon color={tk.pink} />
          <Text style={[styles.openText, { color: tk.pink }]}>Delete account</Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.confirmCard,
            { backgroundColor: tk.pinkSoft, borderColor: tk.pink },
          ]}
        >
          <Text style={[styles.confirmTitle, { color: tk.text }]}>
            Delete your account?
          </Text>
          <Text style={[styles.confirmBody, { color: tk.variant }]}>
            This permanently erases your account with FPL Gaffer including
            all your personal information, team, history and chips. You will
            have 30 days to restore your account after deletion before it
            becomes permanent. You can't restore your account past the 30
            days.
          </Text>

          <Text style={[styles.confirmHint, { color: tk.variant }]}>
            Type your email to confirm:
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Type your email"
            placeholderTextColor={tk.faint}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[
              styles.emailInput,
              { color: tk.text, borderColor: tk.cardBorder, backgroundColor: tk.card },
            ]}
          />

          {error && (
            <Text style={[styles.error, { color: tk.pink }]}>{error}</Text>
          )}

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => {
                setConfirm(false);
                setTyped('');
                setError(null);
              }}
              style={[
                styles.cancelBtn,
                { backgroundColor: tk.card, borderColor: tk.cardBorder },
              ]}
            >
              <Text style={[styles.cancelText, { color: tk.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              disabled={!matches || submitting}
              style={[
                styles.deleteBtn,
                { backgroundColor: matches && !submitting ? tk.pink : tk.faint },
              ]}
            >
              <Text style={styles.deleteText}>
                {submitting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function BinIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 28,
  },
  openBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  openText: { fontFamily: 'Archivo_700Bold', fontSize: 15 },
  confirmCard: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  confirmTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  confirmBody: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },
  confirmHint: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 14,
    marginBottom: 6,
  },
  emailInput: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  error: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 8,
    textAlign: 'center',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
  deleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontFamily: 'Archivo_700Bold', fontSize: 14, color: '#fff' },
});
