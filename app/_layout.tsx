import { Colors } from '@/constants/theme';
import { registerBackgroundSync } from '@/services/backgroundTaskService';
import { initDB } from '@/services/database';
import app from '@/services/firebase';
import { requestNotificationPermission } from '@/services/notificationService';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('Firebase initialised:', app.name);

        // Wait for database to fully initialise first
        await initDB();
        console.log('Database initialised');

        // Then request notification permission
        await requestNotificationPermission();

        // Register background sync task
try {
  await registerBackgroundSync();
  console.log('Background sync registered');
} catch (err) {
  console.log('Background sync not available in Expo Go — will work in production build');
}

        // Listen for incoming notifications
        notificationListener.current = Notifications.addNotificationReceivedListener(
          (notification) => {
            console.log('Notification received:', notification);
          }
        );

        // Listen for when user taps a notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            console.log('Notification tapped:', response);
          }
        );

        // Only render screens after DB is ready
        setDbReady(true);

      } catch (err) {
        console.error('Init error:', err);
        // Still render even if something fails
        setDbReady(true);
      }
    };

    init();

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // Show loading spinner until DB is ready
  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}