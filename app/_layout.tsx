import { Colors } from '@/constants/theme';
import { initDB } from '@/services/database';
import app from '@/services/firebase';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDB();
        console.log('SQLite initialised');
        console.log('Firebase initialised:', app.name);
      } catch (err) {
        console.error('App init error:', err);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: Colors.background,
        }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="team-setup" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
