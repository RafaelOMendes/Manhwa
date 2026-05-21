import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { API_BASE } from './api';

interface PendingEntry {
    downloadedAt: string;
    totalPages: number;
    chapterNumber?: number;
}

interface CachedEntry {
    downloadedAt: string;
    readAt: string;
    totalPages: number;
    chapterNumber?: number;
}

/** Extrai número do capítulo do nome do arquivo (fallback pra entries antigas sem chapterNumber). */
function extractChapterNumberFromFilename(filename: string): number {
    const m = filename.match(/(?:cap(?:[ií]tulo)?\.?\s*|chapter\s*|ch\.?\s*|ep\.?\s*|#)(\d+(?:\.\d+)?)/i);
    if (m) return Math.floor(parseFloat(m[1]));
    const nums = filename.match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length > 0) return Math.floor(parseFloat(nums[nums.length - 1]));
    return 0;
}

function chapterNumberFor(entry: { chapterNumber?: number } | undefined, filename: string): number {
    return entry?.chapterNumber ?? extractChapterNumberFromFilename(filename);
}

interface ManhwaCache {
    pending: Record<string, PendingEntry>;
    cached: Record<string, CachedEntry>;
    /** Filename → ISO date. Conjunto persistente de chapters EXPLICITAMENTE lidos. */
    read: Record<string, string>;
    /** Quando esse manhwa migrou do esquema cumulativo (current_chapter) pra per-chapter. One-shot. */
    migratedAt?: string;
}

type CacheIndex = Record<string, ManhwaCache>;

const STORAGE_KEY = 'manhwa-cache-v1';
const LIST_KEY = 'manhwa-list-v1';
const FILES_KEY = 'manhwa-files-v1';
const SCROLL_KEY = 'manhwa-scroll-v1';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED = 5;
/** Chapters baixados em paralelo dentro de um mesmo manhwa. */
const CHAPTER_CONCURRENCY = 5;

async function loadIndex(): Promise<CacheIndex> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed: CacheIndex = JSON.parse(raw);
        // Migração: garante que toda entrada tem `read`. Inicializa com keys de `cached`
        // pra recuperar histórico parcial do esquema antigo (cumulativo).
        for (const id of Object.keys(parsed)) {
            const m = parsed[id];
            if (!m.read) {
                m.read = {};
                for (const filename of Object.keys(m.cached ?? {})) {
                    m.read[filename] = m.cached[filename].readAt;
                }
            }
            if (!m.pending) m.pending = {};
            if (!m.cached) m.cached = {};
        }
        return parsed;
    } catch {
        return {};
    }
}

async function saveIndex(index: CacheIndex): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(index));
}

function chapterDir(manhwaId: number, filename: string): Directory {
    return new Directory(Paths.document, 'manhwas', String(manhwaId), filename);
}

function pageFile(manhwaId: number, filename: string, page: number): File {
    return new File(chapterDir(manhwaId, filename), `page_${page}.jpg`);
}

export interface LocalChapterInfo {
    available: boolean;
    totalPages?: number;
    /** Retorna o URI file:// pra uma página específica. */
    getPageUri?: (page: number) => string;
}

export async function getLocalChapter(manhwaId: number, filename: string): Promise<LocalChapterInfo> {
    const index = await loadIndex();
    const m = index[manhwaId];
    if (!m) return { available: false };
    const entry = m.pending[filename] ?? m.cached[filename];
    if (!entry) return { available: false };
    return {
        available: true,
        totalPages: entry.totalPages,
        getPageUri: (page: number) => pageFile(manhwaId, filename, page).uri,
    };
}

/** Set de filenames disponíveis localmente (pending + cached) pra um manhwa. */
export async function getLocalChaptersSet(manhwaId: number): Promise<Set<string>> {
    const index = await loadIndex();
    const m = index[manhwaId];
    if (!m) return new Set();
    return new Set([...Object.keys(m.pending), ...Object.keys(m.cached)]);
}

/**
 * Mantém só os 5 caps lidos de MAIOR chapter_number (regra "do cap N pra trás removido").
 * Files dos demais são apagados do disco e a entrada some do `cached`
 * (mas continuam em `read` — esse set é permanente).
 */
function trimCached(m: ManhwaCache, manhwaId: number): string[] {
    const entries = Object.entries(m.cached);
    if (entries.length <= MAX_CACHED) return [];
    entries.sort((a, b) => chapterNumberFor(b[1], b[0]) - chapterNumberFor(a[1], a[0]));
    const evicted: string[] = [];
    for (const [filename] of entries.slice(MAX_CACHED)) {
        try {
            const dir = chapterDir(manhwaId, filename);
            if (dir.exists) dir.delete();
        } catch (e) {
            console.warn(`[cache] erro ao apagar ${filename}:`, e);
        }
        delete m.cached[filename];
        evicted.push(filename);
    }
    return evicted;
}

/** Aplica o trim de 5-caps pra todos os manhwas (chamado no app start). */
export async function trimAllCached(): Promise<{ trimmed: number }> {
    const index = await loadIndex();
    let trimmed = 0;
    for (const idStr of Object.keys(index)) {
        const evicted = trimCached(index[idStr], Number(idStr));
        trimmed += evicted.length;
    }
    await saveIndex(index);
    return { trimmed };
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

function isImageEntry(name: string): boolean {
    const base = name.split('/').pop() || '';
    if (!base || base.startsWith('.')) return false;
    const dot = base.lastIndexOf('.');
    if (dot < 0) return false;
    return IMAGE_EXTS.has(base.slice(dot).toLowerCase());
}

/**
 * Baixa o .cbz inteiro de um chapter e extrai as páginas pra disco.
 * Retorna o número de páginas extraídas.
 */
async function downloadChapter(manhwaId: number, filename: string): Promise<number> {
    const t0 = Date.now();
    console.log(`[download] ⬇️  #${manhwaId}/${filename} iniciando...`);

    const dir = chapterDir(manhwaId, filename);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const cbzTemp = new File(dir, '_chapter.cbz');
    const remoteUrl = `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/download`;

    try {
        await File.downloadFileAsync(remoteUrl, cbzTemp, { idempotent: true });
        const sizeMB = (cbzTemp.size / (1024 * 1024)).toFixed(1);
        const dlMs = Date.now() - t0;
        console.log(`[download]   📦 #${manhwaId}/${filename} CBZ recebido — ${sizeMB}MB em ${dlMs}ms`);

        const tExtract = Date.now();
        const bytes = await cbzTemp.bytes();
        const zip = await JSZip.loadAsync(bytes);

        const entries = Object.entries(zip.files)
            .filter(([name, entry]) => !entry.dir && isImageEntry(name))
            .sort(([a], [b]) => a.localeCompare(b));

        for (let i = 0; i < entries.length; i++) {
            const [, entry] = entries[i];
            const data = await entry.async('uint8array');
            const target = pageFile(manhwaId, filename, i);
            target.write(data);
        }

        try { if (cbzTemp.exists) cbzTemp.delete(); } catch {}
        const extractMs = Date.now() - tExtract;
        const totalMs = Date.now() - t0;
        console.log(`[download] ✅ #${manhwaId}/${filename} salvo no app — ${entries.length} páginas, extração ${extractMs}ms, total ${totalMs}ms`);
        return entries.length;
    } catch (e) {
        console.warn(`[download] ❌ #${manhwaId}/${filename} falhou após ${Date.now() - t0}ms:`, e);
        // Limpa estado parcial em caso de falha
        try { if (cbzTemp.exists) cbzTemp.delete(); } catch {}
        try { if (dir.exists) dir.delete(); } catch {}
        throw e;
    }
}

export interface SyncResult {
    downloaded: number;
    movedToCached: number;
    evicted: number;
    errors: number;
}

export interface SyncProgress {
    doneChapters: number;
    totalChapters: number;
    doneMB: number;
    totalMB: number;
}

/**
 * Baixa a cover de um manhwa pra disco (uma vez). Idempotente.
 */
export async function downloadCover(manhwaId: number, coverUrl: string | null | undefined): Promise<void> {
    if (!coverUrl) return;
    const dir = new Directory(Paths.document, 'manhwas', String(manhwaId));
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const coverFile = new File(dir, 'cover.jpg');
    if (coverFile.exists) return;
    const url = coverUrl.startsWith('/') ? `${API_BASE}${coverUrl}` : coverUrl;
    try {
        await File.downloadFileAsync(url, coverFile, { idempotent: true });
    } catch (e) {
        console.warn(`[cache] download cover falhou pra ${manhwaId}:`, e);
    }
}

/** URI file:// da cover local, ou null se não foi baixada. */
export function getLocalCoverUri(manhwaId: number): string | null {
    const file = new File(Paths.document, 'manhwas', String(manhwaId), 'cover.jpg');
    return file.exists ? file.uri : null;
}

/**
 * Sincroniza o cache local de um manhwa.
 * - Baixa chapters não-lidos em paralelo (até CHAPTER_CONCURRENCY simultâneos).
 * - Move pra `cached` chapters lidos que estavam em `pending`.
 * - Mantém só os 5 cached mais recentes.
 * - Baixa a cover pra disco se ainda não tem.
 */
export async function syncManhwaLocal(
    manhwaId: number,
    currentChapter: number,
    files: { name: string; chapter_number: number; size_mb?: number }[],
    coverUrl?: string | null,
    onProgress?: (p: SyncProgress) => void,
    shouldCancel?: () => boolean
): Promise<SyncResult> {
    const tSync = Date.now();
    console.log(`[cache] 🔄 sync manhwa #${manhwaId} — ${files.length} caps no server, current_chapter=${currentChapter}`);

    const index = await loadIndex();
    if (!index[manhwaId]) index[manhwaId] = { pending: {}, cached: {}, read: {} };
    const m = index[manhwaId];

    // Reconcilia o set de lidos com o current_chapter do servidor: o app passa a
    // refletir EXATAMENTE 1..current_chapter (a fila offline é drenada antes do
    // sync, então o servidor já tem as leituras feitas offline).
    if (files.length > 0) {
        applyReadReconcile(m, currentChapter, files);
    }

    const result: SyncResult = { downloaded: 0, movedToCached: 0, evicted: 0, errors: 0 };

    const toDownload: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // Per-chapter: "lido" = está no set local de lidos (não cumulativo)
        const isRead = !!m.read[f.name];
        const inPending = !!m.pending[f.name];
        const inCached = !!m.cached[f.name];

        if (isRead) {
            if (inPending) {
                const entry = m.pending[f.name];
                m.cached[f.name] = { ...entry, readAt: m.read[f.name] };
                delete m.pending[f.name];
                result.movedToCached++;
            }
        } else if (!inPending && !inCached) {
            toDownload.push(f.name);
        }
    }

    if (toDownload.length > 0) {
        console.log(`[cache]   📥 ${toDownload.length} caps não-lidos pra baixar (paralelo x${CHAPTER_CONCURRENCY})`);
    } else {
        console.log(`[cache]   📥 nenhum cap novo pra baixar`);
    }

    // Download dos chapters não-lidos em paralelo (semáforo)
    const queue = [...toDownload];
    const downloaded: { filename: string; totalPages: number }[] = [];

    // Progresso por capítulo + por MB (size_mb vem do endpoint /files)
    const sizeByName = new Map(files.map(f => [f.name, f.size_mb ?? 0]));
    const totalChapters = toDownload.length;
    const totalMB = toDownload.reduce((s, fn) => s + (sizeByName.get(fn) ?? 0), 0);
    let doneChapters = 0;
    let doneMB = 0;
    onProgress?.({ doneChapters, totalChapters, doneMB, totalMB });

    const worker = async () => {
        while (queue.length > 0) {
            // Cancelamento: para de pegar novos capítulos (o atual termina e é salvo).
            if (shouldCancel?.()) { queue.length = 0; return; }
            const fn = queue.shift();
            if (!fn) return;
            try {
                const totalPages = await downloadChapter(manhwaId, fn);
                downloaded.push({ filename: fn, totalPages });
                doneChapters++;
                doneMB += sizeByName.get(fn) ?? 0;
                onProgress?.({ doneChapters, totalChapters, doneMB, totalMB });
            } catch (e) {
                console.warn(`[cache] download falhou pra ${fn}:`, e);
                result.errors++;
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(CHAPTER_CONCURRENCY, toDownload.length || 1) }, worker));

    // Map de filename → chapter_number pra preservar a posição nas entries
    const chapterNumberByName = new Map(files.map(f => [f.name, f.chapter_number]));

    for (const { filename, totalPages } of downloaded) {
        m.pending[filename] = {
            downloadedAt: new Date().toISOString(),
            totalPages,
            chapterNumber: chapterNumberByName.get(filename),
        };
        result.downloaded++;
    }

    // Preserva chapterNumber também nas entries existentes (em pending/cached) se estiver faltando
    for (const f of files) {
        if (m.pending[f.name] && m.pending[f.name].chapterNumber === undefined) {
            m.pending[f.name].chapterNumber = f.chapter_number;
        }
        if (m.cached[f.name] && m.cached[f.name].chapterNumber === undefined) {
            m.cached[f.name].chapterNumber = f.chapter_number;
        }
    }

    const evicted = trimCached(m, manhwaId);
    result.evicted = evicted.length;
    if (evicted.length > 0) {
        console.log(`[cache]   🗑️  trim removeu ${evicted.length} caps antigos: ${evicted.join(', ')}`);
    }

    await saveIndex(index);

    // Persiste o snapshot da lista (com chapter_number) pra leitura offline:
    // garante que os números/ordem dos capítulos fiquem salvos no aparelho
    // mesmo pra manhwas baixados em segundo plano (sem abrir online).
    if (files.length > 0) {
        await saveManhwaFiles(
            manhwaId,
            files.map(f => ({ name: f.name, size_mb: f.size_mb ?? 0, chapter_number: f.chapter_number }))
        ).catch(() => {});
    }

    // Cover é fire-and-forget (não bloqueia o sync)
    downloadCover(manhwaId, coverUrl).catch(() => {});

    const syncMs = Date.now() - tSync;
    console.log(
        `[cache] ✓ sync manhwa #${manhwaId} concluído em ${syncMs}ms — ` +
        `${result.downloaded} baixados, ${result.movedToCached} pending→cached, ` +
        `${result.evicted} evicted, ${result.errors} erros`
    );

    return result;
}

/**
 * Marca um chapter como lido (per-chapter, não cumulativo).
 * - Sempre adiciona ao set `read` persistente (mesmo se o chapter não estava em pending).
 * - Se estava em pending, move pra cached.
 */
export async function markChapterReadLocal(manhwaId: number, filename: string): Promise<void> {
    const index = await loadIndex();
    if (!index[manhwaId]) index[manhwaId] = { pending: {}, cached: {}, read: {} };
    const m = index[manhwaId];

    const now = new Date().toISOString();
    const alreadyRead = !!m.read[filename];
    m.read[filename] = now;

    let movedToCached = false;
    if (m.pending[filename]) {
        const entry = m.pending[filename];
        m.cached[filename] = { ...entry, readAt: now };
        delete m.pending[filename];
        movedToCached = true;
    }
    const evicted = trimCached(m, manhwaId);

    await saveIndex(index);

    console.log(
        `[cache] ✓ markRead #${manhwaId}/${filename} — ` +
        `${alreadyRead ? 'já estava em read' : 'NOVO em read'}` +
        `${movedToCached ? ', pending→cached' : ''}` +
        `${evicted.length > 0 ? `, evictou ${evicted.length} antigos (${evicted.join(', ')})` : ''}`
    );
}

/** Set de filenames que o usuário leu (per-chapter, sem cumulativo). */
export async function getReadChaptersSet(manhwaId: number): Promise<Set<string>> {
    const index = await loadIndex();
    const m = index[manhwaId];
    if (!m) return new Set();
    return new Set(Object.keys(m.read ?? {}));
}

/**
 * Reconcilia o set de "lidos" com o current_chapter do servidor (fonte de
 * verdade): lido = capítulos nas posições 1..current_chapter. Reescreve o set,
 * fazendo o app refletir EXATAMENTE o que está online (remove leituras além do
 * current_chapter). As leituras offline são drenadas pra fila ANTES de reconciliar,
 * então já estão no servidor — por isso usamos o valor do servidor direto.
 */
function applyReadReconcile(
    m: ManhwaCache,
    currentChapter: number,
    files: { name: string }[]
): void {
    const cutoff = Math.min(Math.max(currentChapter || 0, 0), files.length);
    const reconciled: Record<string, string> = {};
    const now = new Date().toISOString();
    for (let i = 0; i < cutoff; i++) {
        const name = files[i].name;
        reconciled[name] = m.read[name] ?? now;
    }
    m.read = reconciled;
    m.migratedAt = m.migratedAt ?? now;
}

/**
 * Reconcilia o estado de leitura local com o current_chapter FRESCO do servidor.
 * Use ao sincronizar ou ao abrir o manhwa online (onde há um valor confiável).
 * IMPORTANTE: drene a fila offline (drainQueue) ANTES de chamar, pra que leituras
 * feitas offline já estejam refletidas no current_chapter do servidor.
 */
export async function reconcileReadsWithServer(
    manhwaId: number,
    currentChapter: number,
    files: { name: string }[]
): Promise<void> {
    if (files.length === 0) return;
    const index = await loadIndex();
    if (!index[manhwaId]) index[manhwaId] = { pending: {}, cached: {}, read: {} };
    const m = index[manhwaId];
    applyReadReconcile(m, currentChapter, files);
    await saveIndex(index);
}

// ============================================================
// Scroll position (persistido localmente pra leitura offline)
// ============================================================

interface ScrollEntry {
    position: number;
    at: string;
}

type ScrollMap = Record<string, Record<string, ScrollEntry>>; // [manhwaId][filename]

async function loadScrollMap(): Promise<ScrollMap> {
    try {
        const raw = await AsyncStorage.getItem(SCROLL_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

async function saveScrollMap(map: ScrollMap): Promise<void> {
    await AsyncStorage.setItem(SCROLL_KEY, JSON.stringify(map));
}

export async function saveLocalScroll(manhwaId: number, filename: string, position: number): Promise<void> {
    try {
        const map = await loadScrollMap();
        const key = String(manhwaId);
        if (!map[key]) map[key] = {};
        map[key][filename] = { position, at: new Date().toISOString() };
        await saveScrollMap(map);
    } catch (e) {
        console.warn('[cache] saveLocalScroll:', e);
    }
}

export async function getLocalScroll(manhwaId: number, filename: string): Promise<number | null> {
    try {
        const map = await loadScrollMap();
        const entry = map[String(manhwaId)]?.[filename];
        return entry?.position ?? null;
    } catch {
        return null;
    }
}

async function clearLocalScrollFor(manhwaId: number): Promise<void> {
    try {
        const map = await loadScrollMap();
        if (map[String(manhwaId)]) {
            delete map[String(manhwaId)];
            await saveScrollMap(map);
        }
    } catch {}
}

/** Remove tudo localmente (pending + cached + diretório + scroll) pra um manhwa. */
export async function removeManhwaLocal(manhwaId: number): Promise<void> {
    const index = await loadIndex();
    try {
        const dir = new Directory(Paths.document, 'manhwas', String(manhwaId));
        if (dir.exists) dir.delete();
    } catch (e) {
        console.warn(`[cache] erro ao apagar diretório do manhwa ${manhwaId}:`, e);
    }
    if (index[manhwaId]) {
        delete index[manhwaId];
        await saveIndex(index);
    }
    await clearLocalScrollFor(manhwaId);
}

// ============================================================
// Snapshots pra modo offline (lista de manhwas + files por manhwa)
// ============================================================

export interface CbzFileSnapshot {
    name: string;
    size_mb: number;
    chapter_number: number;
}

export async function saveManhwaList<T>(list: T[]): Promise<void> {
    try {
        await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[cache] saveManhwaList:', e);
    }
}

export async function loadManhwaList<T = unknown>(): Promise<T[] | null> {
    try {
        const raw = await AsyncStorage.getItem(LIST_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export async function saveManhwaFiles(manhwaId: number, files: CbzFileSnapshot[]): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(FILES_KEY);
        const obj: Record<string, CbzFileSnapshot[]> = raw ? JSON.parse(raw) : {};
        obj[manhwaId] = files;
        await AsyncStorage.setItem(FILES_KEY, JSON.stringify(obj));
    } catch (e) {
        console.warn('[cache] saveManhwaFiles:', e);
    }
}

export async function loadManhwaFiles(manhwaId: number): Promise<CbzFileSnapshot[] | null> {
    try {
        const raw = await AsyncStorage.getItem(FILES_KEY);
        if (!raw) return null;
        const obj: Record<string, CbzFileSnapshot[]> = JSON.parse(raw);
        return obj[manhwaId] ?? null;
    } catch {
        return null;
    }
}

// ============================================================
// Uso de armazenamento (bytes em disco)
// ============================================================

function dirSizeBytes(dir: Directory): number {
    let total = 0;
    let entries: (File | Directory)[];
    try {
        entries = dir.list();
    } catch {
        return 0;
    }
    for (const entry of entries) {
        if (entry instanceof File) {
            try { total += entry.size ?? 0; } catch {}
        } else if (entry instanceof Directory) {
            total += dirSizeBytes(entry);
        }
    }
    return total;
}

/** Bytes totais ocupados por tudo que foi baixado (todos os manhwas). */
export async function getStorageUsage(): Promise<number> {
    const root = new Directory(Paths.document, 'manhwas');
    if (!root.exists) return 0;
    return dirSizeBytes(root);
}

/** Bytes ocupados localmente por um manhwa específico. */
export async function getManhwaStorage(manhwaId: number): Promise<number> {
    const dir = new Directory(Paths.document, 'manhwas', String(manhwaId));
    if (!dir.exists) return 0;
    return dirSizeBytes(dir);
}

/** Set de ids de manhwa que têm algo baixado no índice (1 leitura do índice). */
export async function getManhwasWithLocalData(): Promise<Set<number>> {
    const index = await loadIndex();
    const ids = new Set<number>();
    for (const idStr of Object.keys(index)) {
        const m = index[idStr];
        if (Object.keys(m.pending).length > 0 || Object.keys(m.cached).length > 0) {
            ids.add(Number(idStr));
        }
    }
    return ids;
}

/**
 * Remove do disco o que está corrompido/órfão:
 * - diretórios de manhwa que não estão no índice;
 * - pastas de capítulo não presentes em pending/cached (downloads interrompidos);
 * - capítulos no índice mas sem páginas (page_0.jpg ausente) — corrompidos;
 * - arquivos .cbz temporários residuais (_chapter.cbz).
 * NÃO deve rodar com download ativo (apagaria o que está baixando agora).
 */
export async function cleanupCorrupted(): Promise<{ removedChapters: number; removedManhwas: number }> {
    const root = new Directory(Paths.document, 'manhwas');
    if (!root.exists) return { removedChapters: 0, removedManhwas: 0 };

    const index = await loadIndex();
    let removedChapters = 0;
    let removedManhwas = 0;
    let indexChanged = false;

    let manhwaDirs: (File | Directory)[];
    try { manhwaDirs = root.list(); } catch { return { removedChapters: 0, removedManhwas: 0 }; }

    for (const entry of manhwaDirs) {
        if (!(entry instanceof Directory)) {
            try { entry.delete(); } catch {}
            continue;
        }
        const idStr = entry.name;
        const m = index[idStr];

        if (!m) {
            // Manhwa não está no índice → tudo aqui é órfão.
            try { entry.delete(); removedManhwas++; } catch {}
            continue;
        }

        const known = new Set([...Object.keys(m.pending), ...Object.keys(m.cached)]);

        let chapterDirs: (File | Directory)[];
        try { chapterDirs = entry.list(); } catch { continue; }

        for (const sub of chapterDirs) {
            if (sub instanceof File) {
                // arquivo solto: mantém a cover, remove .cbz temporário/residual
                if (sub.name.toLowerCase().endsWith('.cbz')) {
                    try { sub.delete(); } catch {}
                }
                continue;
            }
            if (!(sub instanceof Directory)) continue;

            // Remove .cbz temporário dentro da pasta do capítulo
            try {
                const temp = new File(sub, '_chapter.cbz');
                if (temp.exists) temp.delete();
            } catch {}

            const isKnown = known.has(sub.name);
            const firstPage = new File(sub, 'page_0.jpg');
            const hasPages = (() => { try { return firstPage.exists; } catch { return false; } })();

            // Órfão (não no índice) OU conhecido mas sem páginas (corrompido) → remove.
            if (!isKnown || !hasPages) {
                try { sub.delete(); removedChapters++; } catch {}
                if (m.pending[sub.name]) { delete m.pending[sub.name]; indexChanged = true; }
                if (m.cached[sub.name]) { delete m.cached[sub.name]; indexChanged = true; }
            }
        }
    }

    if (indexChanged) await saveIndex(index);
    if (removedChapters > 0 || removedManhwas > 0) {
        console.log(`[cache] 🧹 cleanup: ${removedChapters} caps corrompidos/órfãos, ${removedManhwas} manhwas órfãos removidos`);
    }
    return { removedChapters, removedManhwas };
}

/** Remove cached com readAt > 7 dias. */
export async function cleanupExpired(): Promise<{ removed: number }> {
    const index = await loadIndex();
    const now = Date.now();
    let removed = 0;

    for (const manhwaIdStr of Object.keys(index)) {
        const manhwaId = Number(manhwaIdStr);
        const m = index[manhwaIdStr];
        for (const filename of Object.keys(m.cached)) {
            const readAt = new Date(m.cached[filename].readAt).getTime();
            if (now - readAt > SEVEN_DAYS_MS) {
                try {
                    const dir = chapterDir(manhwaId, filename);
                    if (dir.exists) dir.delete();
                } catch (e) {
                    console.warn(`[cache] erro ao apagar expirado ${filename}:`, e);
                }
                delete m.cached[filename];
                removed++;
            }
        }
    }

    await saveIndex(index);
    return { removed };
}
