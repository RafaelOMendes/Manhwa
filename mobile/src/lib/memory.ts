import { Platform } from 'react-native';
import * as LegacyFS from 'expo-file-system/legacy';

/**
 * Leitura de memória pra conferir, DE DENTRO DO APP, se o leitor está
 * devolvendo a RAM (não dá pra ver logcat no aparelho do dia a dia).
 *
 * Vem de `/proc` (Android/Linux), que o próprio processo pode ler:
 * - `appMB`: `VmRSS` de `/proc/self/status` — RAM residente deste processo.
 *   ⚠️ NÃO inclui memória gráfica: bitmap de hardware (o Glide usa no
 *   Android 10+) mora em buffers de GPU fora do RSS. Um vazamento de página
 *   pode quase não aparecer aqui.
 * - `freeMB`: `MemAvailable` de `/proc/meminfo` — o que o SISTEMA ainda tem
 *   pra dar. É o número que importa pro "aparelho resetando": cai junto com
 *   qualquer tipo de memória que o app segure, gráfica inclusive.
 *
 * Tudo aqui é best-effort: qualquer falha (iOS, ROM que bloqueia `/proc`)
 * devolve `null` e quem chama simplesmente não mostra nada.
 */
export interface MemorySample {
    appMB: number | null;
    freeMB: number | null;
    totalMB: number | null;
}

function kbFieldToMB(text: string, field: string): number | null {
    const match = text.match(new RegExp(`^${field}:\\s+(\\d+)\\s*kB`, 'm'));
    return match ? parseInt(match[1], 10) / 1024 : null;
}

async function readProc(path: string): Promise<string | null> {
    try {
        return await LegacyFS.readAsStringAsync(`file://${path}`);
    } catch {
        return null;
    }
}

export async function readMemory(): Promise<MemorySample | null> {
    if (Platform.OS !== 'android') return null;
    const [status, meminfo] = await Promise.all([readProc('/proc/self/status'), readProc('/proc/meminfo')]);
    if (!status && !meminfo) return null;
    const sample: MemorySample = {
        appMB: status ? kbFieldToMB(status, 'VmRSS') : null,
        freeMB: meminfo ? kbFieldToMB(meminfo, 'MemAvailable') : null,
        totalMB: meminfo ? kbFieldToMB(meminfo, 'MemTotal') : null,
    };
    return sample.appMB === null && sample.freeMB === null ? null : sample;
}

function formatMB(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** `app 412 MB · livre 3.1 GB` (só as partes que deu pra ler). */
export function formatMemory(sample: MemorySample | null): string {
    if (!sample) return '';
    const parts: string[] = [];
    if (sample.appMB !== null) parts.push(`app ${formatMB(sample.appMB)}`);
    if (sample.freeMB !== null) parts.push(`livre ${formatMB(sample.freeMB)}`);
    return parts.join(' · ');
}
