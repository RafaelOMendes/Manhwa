import { useSyncExternalStore } from 'react';
import { API_BASE } from './api';
import { Manhwa } from '../types/manhwa';
import { syncManhwaLocal, SyncProgress } from './cache';

/**
 * Store global de progresso de download, observável por qualquer tela.
 * Permite acompanhar ao vivo o que está sendo baixado (caps + MB),
 * tanto no sync global quanto no download individual.
 */

export interface ManhwaProgress {
    status: 'downloading' | 'done' | 'error' | 'cancelled';
    doneChapters: number;
    totalChapters: number;
    doneMB: number;
    totalMB: number;
}

interface State {
    /** Algum download em andamento (global ou individual). */
    active: boolean;
    progress: Record<number, ManhwaProgress>;
}

let state: State = { active: false, progress: {} };
const listeners = new Set<() => void>();

function emit() {
    // Nova referência a cada emit pra useSyncExternalStore detectar a mudança.
    state = { active: state.active, progress: { ...state.progress } };
    listeners.forEach(l => l());
}

function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

function getState(): State {
    return state;
}

export function useDownloadProgress(): State {
    return useSyncExternalStore(subscribe, getState, getState);
}

/** Acesso ao store fora do React (ex.: foreground service). */
export const subscribeStore = subscribe;
export const getStoreState = getState;

/** Limpa entradas concluídas/com erro (ex.: ao recarregar a tela). */
export function clearFinishedProgress(): void {
    for (const id of Object.keys(state.progress)) {
        if (state.progress[Number(id)].status !== 'downloading') {
            delete state.progress[Number(id)];
        }
    }
    emit();
}

// ============================================================
// Cancelamento de download
// ============================================================
let cancelRequested = false;

/** Recomeça uma sessão de download (limpa o pedido de cancelamento). */
export function resetCancel(): void {
    cancelRequested = false;
}

/** Verdadeiro se o usuário pediu pra parar — checado entre capítulos/manhwas. */
export function isCancelRequested(): boolean {
    return cancelRequested;
}

/** Pede pra parar tudo: o capítulo atual termina, o resto é abortado. */
export function requestCancel(): void {
    cancelRequested = true;
    for (const id of Object.keys(state.progress)) {
        const p = state.progress[Number(id)];
        if (p.status === 'downloading') {
            state.progress[Number(id)] = { ...p, status: 'cancelled' };
        }
    }
    state.active = false;
    emit();
}

interface FileInfo {
    name: string;
    chapter_number: number;
    size_mb?: number;
}

async function fetchFiles(manhwaId: number): Promise<{ files: FileInfo[]; currentChapter: number }> {
    const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/files`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { files: data.files ?? [], currentChapter: data.current_chapter ?? 0 };
}

export interface DownloadResult {
    downloaded: number;
    errors: number;
}

/** Marca um manhwa como "na fila/baixando" pra feedback imediato na UI. */
export function markQueued(manhwaId: number): void {
    const existing = state.progress[manhwaId];
    if (!existing || existing.status !== 'downloading') {
        state.progress[manhwaId] = {
            status: 'downloading',
            doneChapters: 0,
            totalChapters: 0,
            doneMB: 0,
            totalMB: 0,
        };
        state.active = true;
        emit();
    }
}

/**
 * Baixa (sincroniza localmente) os capítulos não-lidos de um manhwa,
 * publicando progresso no store. `files` pode ser pré-carregado pra evitar
 * um fetch duplicado.
 */
export async function downloadManhwa(m: Manhwa, files?: FileInfo[]): Promise<DownloadResult> {
    // Cancelado antes de começar: nem inicia.
    if (cancelRequested) return { downloaded: 0, errors: 0 };

    state.active = true;
    state.progress[m.id] = {
        status: 'downloading',
        doneChapters: 0,
        totalChapters: 0,
        doneMB: 0,
        totalMB: 0,
    };
    emit();

    try {
        let list = files;
        let serverCurrent = m.current_chapter ?? 0;
        if (!list) {
            const fetched = await fetchFiles(m.id);
            list = fetched.files;
            // current_chapter FRESCO do servidor pra reconciliar a leitura local
            serverCurrent = fetched.currentChapter || serverCurrent;
        }
        const onProgress = (p: SyncProgress) => {
            // Não sobrescreve um estado já cancelado.
            if (state.progress[m.id]?.status === 'cancelled') return;
            state.progress[m.id] = { status: 'downloading', ...p };
            emit();
        };
        const r = await syncManhwaLocal(
            m.id,
            serverCurrent,
            list,
            m.cover_url ?? null,
            onProgress,
            isCancelRequested
        );
        const prev = state.progress[m.id];
        state.progress[m.id] = {
            ...prev,
            status: cancelRequested ? 'cancelled' : r.errors > 0 ? 'error' : 'done',
        };
        emit();
        return { downloaded: r.downloaded, errors: r.errors };
    } catch (e) {
        console.warn(`[download-manager] falha em #${m.id}:`, e);
        const prev = state.progress[m.id];
        if (prev) state.progress[m.id] = { ...prev, status: 'error' };
        emit();
        return { downloaded: 0, errors: 1 };
    } finally {
        if (!Object.values(state.progress).some(p => p.status === 'downloading')) {
            state.active = false;
            emit();
        }
    }
}

const MANHWA_CONCURRENCY = 4;

/** Baixa vários manhwas em paralelo (semáforo). Retorna agregado. */
export async function downloadAll(manhwas: Manhwa[]): Promise<DownloadResult> {
    resetCancel(); // nova sessão
    const queue = [...manhwas];
    let downloaded = 0;
    let errors = 0;

    const worker = async () => {
        while (queue.length > 0) {
            if (cancelRequested) return;
            const m = queue.shift();
            if (!m) return;
            const r = await downloadManhwa(m);
            downloaded += r.downloaded;
            errors += r.errors;
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(MANHWA_CONCURRENCY, manhwas.length || 1) }, worker)
    );

    return { downloaded, errors };
}
