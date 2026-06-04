import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { GafferLogo } from '@/components/ui/GafferLogo';

export default function SignIn() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const handleSignIn = () => {
    signIn();
    router.replace('/(home)/(tabs)/team');
  };

  return (
    <View style={styles.container}>
      <GafferLogo size={42} light variant="wordmark" />
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.body}>Mock auth — tap below to enter.</Text>
      <Pressable onPress={handleSignIn} style={styles.btn}>
        <Text style={styles.btnText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#37003C',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
  },
  title: {
    color: '#fff',
    fontFamily: 'Archivo_900Black',
    fontSize: 28,
    marginTop: 32,
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  btn: {
    backgroundColor: '#00E676',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 24,
  },
  btnText: {
    color: '#06351E',
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
  },
});
