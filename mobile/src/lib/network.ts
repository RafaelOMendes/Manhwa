import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Tipo de conexão (Wi-Fi / dados móveis), pro aviso antes de baixar capítulos.
 *
 * Vem do módulo nativo do `expo-network` (`ExpoNetwork`). Ele é carregado como
 * OPCIONAL de propósito: num APK construído sem o `expo-network`, o módulo não
 * existe, `getConnectionKind()` devolve `'unknown'` e nenhum aviso aparece — o
 * app continua funcionando igual. Não importe `expo-network` direto aqui: o
 * import quebraria o bundle num APK sem o módulo.
 *
 * Com VPN ligada (Tailscale, que é como o app fala com o servidor) funciona do
 * mesmo jeito: no Android 10+ o módulo olha os transportes da rede ativa e
 * testa `TRANSPORT_CELLULAR` primeiro, e a rede da VPN carrega os transportes
 * da rede que está por baixo dela.
 */
export type ConnectionKind = 'wifi' | 'cellular' | 'other' | 'none' | 'unknown';

interface ExpoNetworkModule {
    getNetworkStateAsync(): Promise<{ type?: string; isConnected?: boolean }>;
}

let nativeModule: ExpoNetworkModule | null | undefined;

function getModule(): ExpoNetworkModule | null {
    if (nativeModule === undefined) {
        try {
            nativeModule = requireOptionalNativeModule<ExpoNetworkModule>('ExpoNetwork');
        } catch {
            nativeModule = null;
        }
    }
    return nativeModule ?? null;
}

/** `false` num APK sem o `expo-network`: aí não dá pra saber o tipo de conexão. */
export function canDetectConnection(): boolean {
    return getModule() !== null;
}

const TIMEOUT_MS = 3000;

export async function getConnectionKind(): Promise<ConnectionKind> {
    const mod = getModule();
    if (!mod) return 'unknown';
    try {
        const state = await Promise.race([
            mod.getNetworkStateAsync(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS)),
        ]);
        switch (state?.type) {
            case 'CELLULAR': return 'cellular';
            case 'WIFI':
            case 'ETHERNET': return 'wifi';
            case 'NONE': return 'none';
            case undefined:
            case 'UNKNOWN': return 'unknown';
            default: return 'other';
        }
    } catch {
        return 'unknown';
    }
}

/**
 * `true` enquanto o aparelho estiver nos dados móveis. Confere ao montar, a cada
 * `intervalMs` e quando o app volta pro primeiro plano. Num APK sem o módulo
 * fica sempre `false` e não agenda nada.
 */
export function useIsOnCellular(intervalMs = 10_000): boolean {
    const [cellular, setCellular] = useState(false);
    useEffect(() => {
        if (!canDetectConnection()) return;
        let cancelled = false;
        const check = () => {
            getConnectionKind().then(kind => {
                if (!cancelled) setCellular(kind === 'cellular');
            }).catch(() => {});
        };
        check();
        const timer = setInterval(check, intervalMs);
        const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
        return () => {
            cancelled = true;
            clearInterval(timer);
            sub.remove();
        };
    }, [intervalMs]);
    return cellular;
}
