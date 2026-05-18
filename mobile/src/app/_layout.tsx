import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ 
        headerShown: false,
        contentStyle: { backgroundColor: '#262525' }
      }}>
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}
