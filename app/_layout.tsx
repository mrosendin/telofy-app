import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'react-native-reanimated';

import '../global.css';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// TanStack Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

// Custom dark theme for Telofy
const TelofyTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#22c55e',
    background: '#0a0a0b',
    card: '#141416',
    text: '#fafafa',
    border: '#27272a',
    notification: '#ef4444',
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={TelofyTheme}>
        <StatusBar style="light" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen 
            name="create-objective" 
            options={{ headerShown: false }} 
          />
          <Stack.Screen 
            name="modal" 
            options={{ 
              presentation: 'modal',
              headerStyle: { backgroundColor: '#141416' },
              headerTintColor: '#fafafa',
            }} 
          />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
