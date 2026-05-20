import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './api';

/**
 * Fila persistida de operações que precisam ir pro servidor.
 * Permite leitura offline: as escritas são enfileiradas e drenadas quando voltar a conexão.
 *
 * Dedupe-by-key:
 *   - chapterReads: 1 entrada por manhwaId, mantendo o MAIOR chapNum
 *     (evita regressão se ler vários offline antes de sincronizar)
 *   - scrolls: 1 entrada por (manhwaId, filename), sempre o último position
 */

interface ChapterReadOp {
    chapNum: number;
    at: string; // ISO timestamp
}

interface ScrollOp {
    position: number;
    at: string;
}

interface QueueShape {
    chapterReads: Record<string, ChapterReadOp>; // key = manhwaId
    scrolls: Record<string, Record<string, ScrollOp>>; // [manhwaId][filename]
}

const STORAGE_KEY = 'manhwa-sync-queue-v1';

async function loadQueue(): Promise<QueueShape> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return { chapterReads: {}, scrolls: {} };
        const parsed = JSON.parse(raw);
        return {
            chapterReads: parsed.chapterReads ?? {},
            scrolls: parsed.scrolls ?? {},
        };
    } catch {
        return { chapterReads: {}, scrolls: {} };
    }
}

async function saveQueue(q: QueueShape): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

export async function enqueueChapterRead(manhwaId: number, chapNum: number): Promise<void> {
    const q = await loadQueue();
    const key = String(manhwaId);
    const existing = q.chapterReads[key];
    if (!existing || chapNum > existing.chapNum) {
        q.chapterReads[key] = { chapNum, at: new Date().toISOString() };
        await saveQueue(q);
    }
}

export async function enqueueScroll(manhwaId: number, filename: string, position: number): Promise<void> {
    const q = await loadQueue();
    const key = String(manhwaId);
    if (!q.scrolls[key]) q.scrolls[key] = {};
    q.scrolls[key][filename] = { position, at: new Date().toISOString() };
    await saveQueue(q);
}

export interface DrainResult {
    sent: number;
    failed: number;
    remaining: number;
}

let drainInFlight: Promise<DrainResult> | null = null;

/** Tenta enviar tudo da fila. Itens que falharem permanecem para próxima tentativa. */
export async function drainQueue(): Promise<DrainResult> {
    if (drainInFlight) return drainInFlight;
    drainInFlight = (async () => {
        const q = await loadQueue();
        let sent = 0;
        let failed = 0;

        for (const [manhwaIdStr, op] of Object.entries(q.chapterReads)) {
            try {
                const res = await fetch(`${API_BASE}/api/manhwas/${manhwaIdStr}/current-chapter`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ current_chapter: op.chapNum }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                delete q.chapterReads[manhwaIdStr];
                sent++;
            } catch {
                failed++;
            }
        }

        for (const [manhwaIdStr, byFile] of Object.entries(q.scrolls)) {
            for (const [filename, op] of Object.entries(byFile)) {
                try {
                    const res = await fetch(
                        `${API_BASE}/api/manhwas/${manhwaIdStr}/read/${encodeURIComponent(filename)}/scroll`,
                        {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scroll_position: op.position }),
                        }
                    );
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    delete byFile[filename];
                    sent++;
                } catch {
                    failed++;
                }
            }
            if (Object.keys(byFile).length === 0) delete q.scrolls[manhwaIdStr];
        }

        await saveQueue(q);
        const remaining =
            Object.keys(q.chapterReads).length +
            Object.values(q.scrolls).reduce((acc, byFile) => acc + Object.keys(byFile).length, 0);
        return { sent, failed, remaining };
    })().finally(() => {
        drainInFlight = null;
    });
    return drainInFlight;
}

/** Total de operações pendentes — útil pra feedback de UI. */
export async function queueSize(): Promise<number> {
    const q = await loadQueue();
    return (
        Object.keys(q.chapterReads).length +
        Object.values(q.scrolls).reduce((acc, byFile) => acc + Object.keys(byFile).length, 0)
    );
}
