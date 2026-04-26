import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user) {
      router.replace('/(tabs)');
    } else {
      router.replace('/auth/login');
    }
  }, [user, loading]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}