import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './api';
import { adoptServerCurrentChapter, saveLocalScroll } from './cache';

/**
 * Fila persistida de operações que precisam ir pro servidor.
 * Permite leitura offline: as escritas são enfileiradas e drenadas quando voltar a conexão.
 *
 * Dedupe-by-key:
 *   - chapterReads: 1 entrada por manhwaId, mantendo o MAIOR chapNum
 *     (evita regressão se ler vários offline antes de sincronizar)
 *   - scrolls: 1 entrada por (manhwaId, filename), sempre o último position
 *
 * Comparação de timestamps (app ↔ banco):
 *   O `at` de cada operação é QUANDO o dado foi gerado no celular, e vai pro
 *   servidor como `updated_at`. O backend compara com o `updated_at` da linha e
 *   devolve `success: false` + o valor atual do banco quando o dado da fila já
 *   nasceu velho (o banco mudou depois, ex.: leitura pela web). Nesse caso o app
 *   ADOTA o valor do servidor e tira a operação da fila — reenviar um dado que
 *   já perdeu a disputa só o deixaria preso na fila pra sempre.
 *
 *   Só o drain manda `updated_at`. As escritas ao vivo do leitor (com o usuário
 *   lendo, online) são incondicionais de propósito: o dado acabou de nascer, é
 *   sempre o mais novo, e mandar timestamp ali só exporia essas escritas a
 *   diferença de relógio entre celular e servidor.
 */

interface ChapterReadOp {
    chapNum: number;
    /** ISO timestamp de quando a leitura aconteceu; vira `updated_at` no drain. */
    at: string;
}

interface ScrollOp {
    position: number;
    /** ISO timestamp de quando a posição foi gerada; vira `updated_at` no drain. */
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
    /** Operações descartadas porque o banco já tinha dado mais recente. */
    rejected: number;
    remaining: number;
}

/** Corpo devolvido pelos endpoints de escrita que comparam timestamp. */
interface SyncResponse {
    success?: boolean;
    reason?: string;
    updated_at?: string | null;
    current_chapter?: number;
    scroll_position?: number;
}

/**
 * Lê o JSON da resposta sem deixar um corpo inesperado derrubar o drain.
 * Backend antigo (ou resposta vazia) cai em `{}` → tratado como aceite, que é
 * o comportamento de antes desta mudança.
 */
async function parseSyncResponse(res: Response): Promise<SyncResponse> {
    try {
        return (await res.json()) as SyncResponse;
    } catch {
        return {};
    }
}

let drainInFlight: Promise<DrainResult> | null = null;

/**
 * Tenta enviar tudo da fila. Itens que falharem por REDE permanecem para a
 * próxima tentativa; itens rejeitados por estarem velhos saem da fila depois de
 * o app adotar o valor do servidor (ver comentário no topo do arquivo).
 */
export async function drainQueue(): Promise<DrainResult> {
    if (drainInFlight) return drainInFlight;
    drainInFlight = (async () => {
        const q = await loadQueue();
        let sent = 0;
        let failed = 0;
        let rejected = 0;

        // ⚠️ Scrolls ANTES dos chapterReads, de propósito. O PATCH de
        // current-chapter faz o backend criar ChapterProgress dos capítulos
        // anteriores com scroll_position=0 e data de AGORA. Se ele rodasse
        // primeiro, os scrolls da própria fila (gerados offline, portanto com
        // data mais velha) chegariam depois e perderiam a comparação pra essas
        // linhas zeradas — o app adotaria 0 e jogaria fora a posição real que o
        // usuário leu offline. Mandando os scrolls antes, as linhas já existem
        // com a posição real e o _mark_previous_chapters_read não as toca.
        for (const [manhwaIdStr, byFile] of Object.entries(q.scrolls)) {
            for (const [filename, op] of Object.entries(byFile)) {
                try {
                    const res = await fetch(
                        `${API_BASE}/api/manhwas/${manhwaIdStr}/read/${encodeURIComponent(filename)}/scroll`,
                        {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scroll_position: op.position, updated_at: op.at }),
                        }
                    );
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await parseSyncResponse(res);
                    if (data.success === false) {
                        if (typeof data.scroll_position === 'number') {
                            // Carimba com o `updated_at` do servidor, não com `now`:
                            // o valor é DELE, e mentir na data faria o local vencer
                            // a próxima comparação sem merecer.
                            await saveLocalScroll(
                                Number(manhwaIdStr),
                                filename,
                                data.scroll_position,
                                data.updated_at ?? undefined
                            );
                        }
                        rejected++;
                    } else {
                        sent++;
                    }
                    delete byFile[filename];
                } catch {
                    failed++;
                }
            }
            if (Object.keys(byFile).length === 0) delete q.scrolls[manhwaIdStr];
        }

        for (const [manhwaIdStr, op] of Object.entries(q.chapterReads)) {
            try {
                const res = await fetch(`${API_BASE}/api/manhwas/${manhwaIdStr}/current-chapter`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ current_chapter: op.chapNum, updated_at: op.at }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await parseSyncResponse(res);
                if (data.success === false) {
                    // Banco mais recente: o app se alinha a ele em vez de insistir.
                    if (typeof data.current_chapter === 'number') {
                        console.log(
                            `[sync] manhwa #${manhwaIdStr}: cap ${op.chapNum} (${op.at}) é mais velho que o banco ` +
                            `(cap ${data.current_chapter}, ${data.updated_at}) — adotando o do servidor`
                        );
                        await adoptServerCurrentChapter(Number(manhwaIdStr), data.current_chapter);
                    }
                    rejected++;
                } else {
                    sent++;
                }
                delete q.chapterReads[manhwaIdStr];
            } catch {
                failed++;
            }
        }

        await saveQueue(q);
        const remaining =
            Object.keys(q.chapterReads).length +
            Object.values(q.scrolls).reduce((acc, byFile) => acc + Object.keys(byFile).length, 0);
        return { sent, failed, rejected, remaining };
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
