import { useSyncExternalStore } from 'react';

/**
 * Store global do leitor. O CbzReader é renderizado UMA vez na raiz do app
 * (fora de qualquer Modal), pra que o modo imersivo (esconder status bar +
 * navigation bar) valha pra janela única da activity. Telas abrem o leitor
 * via openReader() em vez de renderizá-lo localmente.
 */

export interface ReaderFile {
    name: string;
    chapter_number: number;
}

export interface ReaderRequest {
    manhwaId: number;
    filename: string;
    chapterNumber?: number;
    files?: ReaderFile[];
    onChapterRead?: (chapterNum: number, filename: string) => void;
    onClose?: () => void;
}

let state: { request: ReaderRequest | null } = { request: null };
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach(l => l());
}

function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

function getState() {
    return state;
}

export function useReaderRequest(): ReaderRequest | null {
    return useSyncExternalStore(subscribe, getState, getState).request;
}

export function openReader(req: ReaderRequest): void {
    state = { request: req };
    emit();
}

/** Troca de capítulo dentro do leitor mantendo callbacks/lista. */
export function navigateReader(filename: string, chapterNumber?: number): void {
    if (!state.request) return;
    state = { request: { ...state.request, filename, chapterNumber } };
    emit();
}

export function closeReader(): void {
    if (!state.request) return;
    state = { request: null };
    emit();
}
