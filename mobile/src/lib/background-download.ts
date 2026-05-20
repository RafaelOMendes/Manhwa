import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';
import { Manhwa } from '../types/manhwa';
import { downloadAll, subscribeStore, getStoreState } from './download-manager';

/**
 * Download em segundo plano via foreground service (Android).
 * Ao tocar em "Baixar", o serviço mantém o processo vivo mesmo com o app
 * fechado, exibindo uma notificação com barra de progresso. Quando termina,
 * encerra o serviço e mostra uma notificação de conclusão.
 */

const CHANNEL_ID = 'downloads';
const PROGRESS_NOTIF_ID = 'manhwa-download-progress';

let currentJob: Manhwa[] = [];
let running = false;

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

// Registra o handler do foreground service no escopo do módulo (uma vez).
// Esse handler roda enquanto a notificação asForegroundService está visível.
if (Platform.OS === 'android') {
    notifee.registerForegroundService(() => {
        return new Promise<void>((resolve) => {
            const unsub = subscribeStore(() => {
                showProgressNotification().catch(() => {});
            });
            (async () => {
                let done = 0;
                let errors = 0;
                try {
                    const r = await downloadAll(currentJob);
                    done = r.downloaded;
                    errors = r.errors;
                } catch {
                    errors++;
                } finally {
                    unsub();
                    running = false;
                    currentJob = [];
                    try {
                        await notifee.stopForegroundService();
                        await showDoneNotification(done, errors);
                    } catch {}
                    resolve();
                }
            })();
        });
    });
}

/**
 * Inicia (ou junta a) um download em segundo plano. No Android sobe um
 * foreground service com notificação de progresso; em outras plataformas
 * cai pro download in-app normal.
 */
export async function startBackgroundDownload(manhwas: Manhwa[]): Promise<void> {
    if (manhwas.length === 0) return;

    if (Platform.OS !== 'android') {
        await downloadAll(manhwas);
        return;
    }

    // Junta itens novos ao job (sem duplicar).
    const ids = new Set(currentJob.map(m => m.id));
    for (const m of manhwas) {
        if (!ids.has(m.id)) currentJob.push(m);
    }

    // Já tem serviço rodando: os novos itens só entram se o downloadAll ainda
    // não os consumiu — pra simplicidade, ignoramos re-disparos enquanto roda.
    if (running) return;
    running = true;

    try {
        await notifee.requestPermission();
        await ensureChannel();
        // Exibir a notificação asForegroundService inicia o serviço, que dispara
        // o handler registrado acima.
        await showProgressNotification();
    } catch (e) {
        console.warn('[bg-download] falha ao iniciar serviço:', e);
        running = false;
        currentJob = [];
        // Fallback: roda in-app pra não deixar o usuário sem download.
        await downloadAll(manhwas).catch(() => {});
    }
}
