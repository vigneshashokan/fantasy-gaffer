import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const session = useAuthStore((s) => s.session);
  return <Redirect href={session ? '/(home)/(tabs)/team' : '/(onboarding)'} />;
}
