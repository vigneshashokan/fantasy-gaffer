import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { ApexTokens } from '@/constants/apexTokens';
import { useA11yAnnounce } from '@/lib/a11y';

interface ReadFieldProps {
  label: string;
  value: string;
  tk: ApexTokens;
  showDivider?: boolean;
  // Present = the row is editable in place: the padlock becomes a pencil and
  // the value becomes an input. Absent = locked, as dob and email are.
  onSave?: (value: string) => Promise<unknown>;
}

export function ReadField({ label, value, tk, showDivider, onSave }: ReadFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useA11yAnnounce(error);

  const next = draft.trim();
  const dirty = editing && next !== '' && next !== value;

  // Tapping the save tick blurs the input first, so commit runs twice for one
  // gesture. A ref rather than `editing` because the press handler that fires
  // was bound before the blur's re-render — its `editing` is stale.
  const committing = useRef(false);

  const commit = async () => {
    if (committing.current) return;
    committing.current = true;
    setEditing(false);
    if (!onSave || !next || next === value) {
      setDraft(value);
      committing.current = false;
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (e) {
      setDraft(value);
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
      committing.current = false;
    }
  };

  return (
    <View
      style={[
        styles.row,
        showDivider && { borderTopColor: tk.line, borderTopWidth: 1 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: tk.faint }]}>{label}</Text>
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            maxLength={40}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel={label}
            testID={`edit-${label.toLowerCase().replace(/ /g, '-')}`}
            style={[styles.value, styles.input, { color: tk.text, borderBottomColor: tk.purple }]}
          />
        ) : (
          <Text style={[styles.value, { color: tk.text }]} numberOfLines={1}>
            {/* Keep the typed name on screen while the write is in flight —
                falling back to `value` flashes the old name until the
                invalidated profile query comes back. */}
            {saving ? draft : value}
          </Text>
        )}
        {error && (
          <Text
            style={[styles.error, { color: tk.pink }]}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        )}
      </View>
      {onSave ? (
        // The tick is the affordance saying the typed name is not saved yet;
        // the pencil never claims that, so an edit in flight looked identical
        // to one already written.
        <Pressable
          onPress={editing ? commit : () => {
            setDraft(value);
            setError(null);
            setEditing(true);
          }}
          // Editing with nothing changed is NOT a disabled pencil: `disabled`
          // is a visible state on iOS, so typing a name back to the original
          // greyed the pencil out as if the row had broken. The press just
          // closes the edit — commit no-ops on an unchanged draft. Only an
          // in-flight write takes the control away.
          disabled={saving}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${dirty ? 'Save' : 'Edit'} ${label.toLowerCase()}`}
          testID={`edit-${label.toLowerCase().replace(/ /g, '-')}-button`}
        >
          <Icon
            name={dirty ? 'check' : 'pencil'}
            color={dirty ? tk.green : tk.purple}
            size={dirty ? 18 : 16}
          />
        </Pressable>
      ) : (
        <View style={{ opacity: 0.6 }}>
          <Icon name="lock" color={tk.faint} size={15} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.74,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 15.5,
    marginTop: 3,
  },
  input: {
    paddingVertical: 0,
    borderBottomWidth: 1.5,
  },
  error: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
    marginTop: 4,
  },
});
