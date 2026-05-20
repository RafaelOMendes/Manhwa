import { Platform } from 'react-native';
import { Manhwa } from '../types/manhwa';
import { downloadAll, downloadManhwa, markQueued, subscribeStore, getStoreState } from './download-manager';

// Carrega o notifee de forma lazy/protegida. Em Expo Go ou builds sem o módulo
// nativo, o require falha e caímos no download in-app — sem quebrar o app.
let notifee: any = null;
let AndroidImportance: any = { LOW: 2 };
let AndroidForegroundServiceType: any = { FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1 };
try {
    const mod = require('@notifee/react-native');
    notifee = mod.default ?? mod;
    if (mod.AndroidImportance) AndroidImportance = mod.AndroidImportance;
    if (mod.AndroidForegroundServiceType) AndroidForegroundServiceType = mod.AndroidForegroundServiceType;
} catch (e) {
    console.warn('[bg-download] @notifee/react-native indisponível:', e);
}

/**
 * Download em segundo plano via foreground service (Android).
 * Ao tocar em "Baixar", o serviço mantém o processo vivo mesmo com o app
 * fechado, exibindo uma notificação com barra de progresso. Quando termina,
 * encerra o serviço e mostra uma notificação de conclusão.
 */

const CHANNEL_ID = 'downloads';
const PROGRESS_NOTIF_ID = 'manhwa-download-progress';
const MANHWA_CONCURRENCY = 4;

// Fila dinâmica: novos manhwas podem ser adicionados a qualquer momento e os
// workers em execução os pegam. inFlight = ids sendo baixados agora (dedupe).
let currentQueue: Manhwa[] = [];
const inFlight = new Set<number>();
let running = false;

/** Drena a fila com workers em paralelo, pegando itens adicionados durante a execução. */
async function drainQueue(): Promise<{ done: number; errors: number }> {
    let done = 0;
    let errors = 0;
    const worker = async () => {
        while (true) {
            const m = currentQueue.shift();
            if (!m) return;
            inFlight.add(m.id);
            try {
                const r = await downloadManhwa(m);
                done += r.downloaded;
                errors += r.errors;
            } catch {
                errors++;
            } finally {
                inFlight.delete(m.id);
            }
        }
    };
    // Re-roda enquanto chegarem itens novos (ex.: usuário toca em vários).
    do {
        await Promise.all(
            Array.from({ length: Math.min(MANHWA_CONCURRENCY, currentQueue.length || 1) }, worker)
        );
    } while (currentQueue.length > 0);
    return { done, errors };
}

/** Soma o progresso (capítulos) de todos os manhwas ativos no store. */
function aggregate(): { done: number; total: number; errors: number } {
    const { progress } = getStoreState();
    let done = 0;
    let total = 0;
    let errors = 0;
    for (const id of Object.keys(progress)) {
        const p = progress[Number(id)];
        done += p.doneChapters;
        total += p.totalChapters;
        if (p.status === 'error') errors++;
    }
    return { done, total, errors };
}

async function ensureChannel(): Promise<void> {
    await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Downloads',
        importance: AndroidImportance.LOW,
    });
}

async function showProgressNotification(): Promise<void> {
    const { done, total } = aggregate();
    await notifee.displayNotification({
        id: PROGRESS_NOTIF_ID,
        title: 'Baixando capítulos',
        body: total > 0 ? `${done}/${total} capítulos` : 'Preparando download...',
        android: {
            channelId: CHANNEL_ID,
            asForegroundService: true,
            foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
            onlyAlertOnce: true,
            ongoing: true,
            progress: total > 0 ? { max: total, current: done } : { indeterminate: true },
            pressAction: { id: 'default' },
        },
    });
}

async function showDoneNotification(done: number, errors: number): Promise<void> {
    await notifee.displayNotification({
        id: PROGRESS_NOTIF_ID,
        title: errors > 0 ? 'Download concluído com erros' : 'Download concluído',
        body: errors > 0
            ? `${done} capítulos baixados · ${errors} manhwa(s) com erro`
            : `${done} capítulos baixados`,
        android: {
            channelId: CHANNEL_ID,
            onlyAlertOnce: true,
            pressAction: { id: 'default' },
        },
    });
}

// Indica se o módulo nativo do notifee está disponível (build com a lib).
// Em builds antigos / Expo Go ele não existe — nesse caso caímos no download
// in-app pra não quebrar o app.
let fgsAvailable = false;

// Registra o handler do foreground service no escopo do módulo (uma vez).
// Esse handler roda enquanto a notificação asForegroundService está visível.
if (Platform.OS === 'android' && notifee) {
    try {
        notifee.registerForegroundService(() => {
            return new Promise<void>((resolve) => {
                const unsub = subscribeStore(() => {
                    showProgressNotification().catch(() => {});
                });
                (async () => {
                    let done = 0;
                    let errors = 0;
                    try {
                        const r = await drainQueue();
                        done = r.done;
                        errors = r.errors;
                    } catch {
                        errors++;
                    } finally {
                        unsub();
                        running = false;
                        try {
                            await notifee.stopForegroundService();
                            await showDoneNotification(done, errors);
                        } catch {}
                        resolve();
                    }
                })();
            });
        });
        fgsAvailable = true;
    } catch (e) {
        console.warn('[bg-download] notifee indisponível, usando download in-app:', e);
        fgsAvailable = false;
    }
}

/**
 * Inicia (ou junta a) um download em segundo plano. No Android sobe um
 * foreground service com notificação de progresso; em outras plataformas
 * (ou sem o módulo nativo do notifee) cai pro download in-app normal.
 */
export async function startBackgroundDownload(manhwas: Manhwa[]): Promise<void> {
    if (manhwas.length === 0) return;

    if (Platform.OS !== 'android' || !fgsAvailable) {
        await downloadAll(manhwas);
        return;
    }

    // Adiciona à fila sem duplicar (nem o que já está na fila nem o que baixa agora).
    const queued = new Set<number>([...currentQueue.map(m => m.id), ...inFlight]);
    for (const m of manhwas) {
        if (!queued.has(m.id)) {
            currentQueue.push(m);
            markQueued(m.id); // feedback imediato na UI (spinner)
        }
    }

    // Serviço já rodando: os workers (drainQueue) pegam os novos itens sozinhos.
    if (running) {
        showProgressNotification().catch(() => {});
        return;
    }
    running = true;

    try {
        await notifee.requestPermission();
        await ensureChannel();
        // Exibir a notificação asForegroundService inicia o serviço, que dispara
        // o handler registrado acima (que chama drainQueue).
        await showProgressNotification();
    } catch (e) {
        console.warn('[bg-download] falha ao iniciar serviço:', e);
        running = false;
        const fallback = [...currentQueue];
        currentQueue = [];
        // Fallback: roda in-app pra não deixar o usuário sem download.
        await downloadAll(fallback).catch(() => {});
    }
}
