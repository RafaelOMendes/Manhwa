import { API_BASE } from './api';

// Timeout curto de propósito: numa rede ruim o fetch padrão pode ficar pendurado
// por ~1min, e a home ficaria travada em "carregando" em vez de cair pro cache.
const PING_TIMEOUT_MS = 10_000;

/**
 * Testa se o servidor está alcançável via `GET /api/ping` (rota trivial, sem
 * token e sem banco). Retorna `true` só em HTTP 200; qualquer erro de rede,
 * status diferente ou estouro dos 10s vira `false`.
 *
 * Nunca lança — o chamador pode tratar o retorno direto como "está online?".
 */
export async function checkConnectivity(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const started = Date.now();

    try {
        const response = await fetch(`${API_BASE}/api/ping`, {
            method: 'GET',
            signal: controller.signal,
        });
        const online = response.status === 200;
        if (__DEV__) {
            console.log(`[connectivity] ping HTTP ${response.status} em ${Date.now() - started}ms → ${online ? 'online' : 'offline'}`);
        }
        return online;
    } catch (error) {
        if (__DEV__) {
            const reason = controller.signal.aborted ? `timeout ${PING_TIMEOUT_MS}ms` : String(error);
            console.log(`[connectivity] ping falhou (${reason}) → offline`);
        }
        return false;
    } finally {
        clearTimeout(timer);
    }
}
