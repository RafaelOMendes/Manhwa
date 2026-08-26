import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { cleanupExpired, trimAllCached } from '../lib/cache';
import { drainQueue } from '../lib/sync-queue';
import ReaderHost from '../components/ReaderHost';
// Side-effect: registra o handler do foreground service de download (uma vez).
import { setupDownloadNotificationPress } from '../lib/background-download';

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const router = useRouter();

  useEffect(() => {
    // Startup: limpa cached expirado + trim pro último capítulo lido + drena fila offline
    cleanupExpired().catch(err => console.warn('[cache] cleanup falhou:', err));
    trimAllCached().catch(err => console.warn('[cache] trim falhou:', err));
    drainQueue().catch(err => console.warn('[sync] drain inicial falhou:', err));

    // Tocar na notificação de download abre a tela de Downloads.
    const unsubPress = setupDownloadNotificationPress(() => router.push('/downloads'));

    // Quando o app voltar do background, drena a fila (usuário pode ter voltado online)
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        drainQueue().catch(err => console.warn('[sync] drain foreground falhou:', err));
      }
    });

    return () => { sub.remove(); unsubPress(); };
  }, [router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#262525' }
      }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="downloads" />
      </Stack>
      <ReaderHost />
    </>
  );
}
