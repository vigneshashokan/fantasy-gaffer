import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme, GUTTER } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { useProfile } from '@/api/profile';
import { usePullRefresh } from '@/lib/query/usePullRefresh';
import { initialsOf } from '@/lib/name';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { ReadField } from '@/components/profile/ReadField';
import { ChangePassword } from '@/components/profile/ChangePassword';
import { DeleteAccount } from '@/components/profile/DeleteAccount';

export default function ProfileModal() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  const { data: profile, isPending, isError, refetch } = useProfile();
  const pull = usePullRefresh(refetch);

  // Error before pending — this screen had no error branch at all (#167).
  if (isError && !profile) {
    return (
      <ErrorState
        tk={tk}
        onRetry={refetch}
        onBack={() => router.back()}
        title="Couldn't load your profile"
        message="Check your connection and try again."
      />
    );
  }
  if (isPending || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: tk.bg, padding: 16 }}>
        <Skeleton height={140} radius={20} />
        <View style={{ height: 16 }} />
        <Skeleton height={220} radius={20} />
      </View>
    );
  }

  const initials = initialsOf(profile.firstName, profile.lastName);

  const heroFrom = t.primary;
  const heroTo = tk.heroBg2;

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      {/* No title row and no back chevron: this is a sheet, so the grabber
          at the top, the drag-down and the scrim are the way out — same call
          as the player detail. */}
      <ScreenHeader gradFrom={heroFrom} gradTo={heroTo}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.firstName} {profile.lastName}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {profile.email}
            </Text>
          </View>
        </View>
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl {...pull} />
        }
      >
        <SectionCard title="Personal details" tk={tk}>
          <ReadField label="First name" value={profile.firstName} tk={tk} />
          <ReadField label="Last name" value={profile.lastName} tk={tk} showDivider />
          <ReadField label="Date of birth" value={profile.dob} tk={tk} showDivider />
          <ReadField label="Email address" value={profile.email} tk={tk} showDivider />
        </SectionCard>

        <SectionCard title="Security" tk={tk}>
          <ChangePassword tk={tk} />
        </SectionCard>

        <Text style={[styles.dangerLabel, { color: tk.faint }]}>Danger zone</Text>
        <DeleteAccount tk={tk} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 21,
  },
  name: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 21,
    color: '#fff',
    letterSpacing: -0.21,
  },
  email: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  dangerLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: GUTTER + 4,
    marginBottom: 8,
  },
});
