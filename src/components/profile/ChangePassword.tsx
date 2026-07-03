import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { changePassword, type AuthErrorKind } from '@/lib/auth/email';

interface ChangePasswordProps {
  tk: ApexTokens;
}

export function ChangePassword({ tk }: ChangePasswordProps) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');

  const ready = cur.length > 0 && nw.length > 0 && nw === cf;
  const mismatch = nw.length > 0 && cf.length > 0 && nw !== cf;

  const reset = () => {
    setCur('');
    setNw('');
    setCf('');
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const r = await changePassword(cur, nw);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone(true);
    setOpen(false);
    reset();
  };

  return (
    <View style={{ borderTopColor: tk.line, borderTopWidth: 1 }}>
      <Pressable
        onPress={() => {
          setOpen((o) => !o);
          setDone(false);
          setError(null);
        }}
        style={styles.head}
        accessibilityRole="button"
      >
        <Icon name="lock" color={tk.faint} size={17} />
        <Text style={[styles.headLabel, { color: tk.text }]}>Change password</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Caret color={tk.faint} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.body}>
          <PasswordField
            placeholder="Current password"
            value={cur}
            onChangeText={setCur}
            tk={tk}
          />
          <PasswordField
            placeholder="New password"
            value={nw}
            onChangeText={setNw}
            tk={tk}
          />
          <PasswordField
            placeholder="Confirm new password"
            value={cf}
            onChangeText={setCf}
            tk={tk}
          />
          {mismatch && (
            <Text style={[styles.errorText, { color: tk.pink }]}>
              Passwords don't match
            </Text>
          )}
          {error && (
            <Text style={[styles.errorText, { color: tk.pink }]}>
              {errorCopy(error)}
            </Text>
          )}
          <Pressable
            disabled={!ready || saving}
            onPress={submit}
            style={[
              styles.submit,
              {
                backgroundColor: ready && !saving ? tk.activeFill : tk.track,
              },
            ]}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.submitText,
                { color: ready && !saving ? '#fff' : tk.faint },
              ]}
            >
              {saving ? 'Updating…' : 'Update password'}
            </Text>
          </Pressable>
        </View>
      )}

      {done && !open && (
        <View style={styles.doneRow}>
          <Icon name="check" color={tk.green} size={16} />
          <Text style={[styles.doneText, { color: tk.green }]}>Password updated</Text>
        </View>
      )}
    </View>
  );
}

function PasswordField({
  placeholder,
  value,
  onChangeText,
  tk,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  tk: ApexTokens;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <TextInput
        secureTextEntry={!visible}
        placeholder={placeholder}
        placeholderTextColor={tk.faint}
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          { backgroundColor: tk.headStrip, color: tk.text, borderColor: tk.cardBorder },
        ]}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        style={styles.eyeBtn}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} color={tk.faint} size={18} />
      </Pressable>
    </View>
  );
}

function errorCopy(kind: AuthErrorKind): string {
  switch (kind) {
    case 'invalid_credentials':
      return 'Current password is incorrect.';
    case 'weak_password':
      return 'New password is too weak.';
    case 'network':
      return 'No connection — try again.';
    case 'rate_limited':
      return 'Too many attempts — try again shortly.';
    default:
      return "Couldn't update password — try again.";
  }
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headLabel: {
    flex: 1,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 9,
  },
  fieldWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    paddingLeft: 14,
    paddingRight: 46,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14.5,
  },
  eyeBtn: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
  },
  submit: {
    height: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  submitText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14.5,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  doneText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
  },
});
