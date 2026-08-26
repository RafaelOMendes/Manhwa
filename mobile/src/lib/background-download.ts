import { Platform } from 'react-native';
import { Manhwa } from '../types/manhwa';
import { downloadAll, downloadManhwa, markQueued, subscribeStore, getStoreState, isCancelRequested, requestCancel, resetCancel } from './download-manager';

// Carrega o notifee de forma lazy/protegida. Em Expo Go ou builds sem o módulo
// nativo, o require falha e caímos no download in-app — sem quebrar o app.
let notifee: any = null;
let AndroidImportance: any = { LOW: 2 };
let AndroidForegroundServiceType: any = { FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1 };
let EventType: any = { PRESS: 1 };
try {
    const mod = require('@notifee/react-native');
    notifee = mod.default ?? mod;
    if (mod.AndroidImportance) AndroidImportance = mod.AndroidImportance;
    if (mod.AndroidForegroundServiceType) AndroidForegroundServiceType = mod.AndroidForegroundServiceType;
    if (mod.EventType) EventType = mod.EventType;
    // Handler de background obrigatório pro notifee (no-op: a navegação ao abrir
    // é feita via getInitialNotification em setupDownloadNotificationPress).
    notifee.onBackgroundEvent(async () => {});
} catch (e) {
    console.warn('[bg-download] @notifee/react-native indisponível:', e);
}

/**
 * Registra o toque na notificação de download → callback (ex.: ir pra tela de
 * Downloads). Cobre app em foreground (onForegroundEvent) e app aberto a partir
 * da notificação estando fechado (getInitialNotification). Retorna unsubscribe.
 */
export function setupDownloadNotificationPress(onPress: () => void): () => void {
    if (!notifee) return () => {};
    let unsub = () => {};
    try {
        unsub = notifee.onForegroundEvent(({ type }: { type: number }) => {
            if (type === EventType.PRESS) onPress();
        });
        notifee.getInitialNotification?.()
            .then((initial: unknown) => { if (initial) setTimeout(onPress, 300); })
            .catch(() => {});
    } catch (e) {
        console.warn('[bg-download] setupDownloadNotificationPress:', e);
    }
    return unsub;
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

/**
 * Intervalo mínimo entre atualizações da notificação de progresso.
 * ⚠️ Não remover. Cada capítulo concluído emite no store, e rodam até
 * MANHWA_CONCURRENCY × CHAPTER_CONCURRENCY (4 × 5 = 20) downloads em paralelo —
 * sem throttle isso vira dezenas de `displayNotification` por segundo, por horas,
 * inundando o NotificationManagerService (system_server) com chamadas binder.
 */
const NOTIF_THROTTLE_MS = 2000;
/** Sem NENHUM progresso por esse tempo, o download está travado → encerra o serviço. */
const FGS_STALL_TIMEOUT_MS = 10 * 60 * 1000;
/** Teto absoluto de vida do serviço, mesmo progredindo. Rede de segurança final. */
const FGS_MAX_RUNTIME_MS = 5 * 60 * 60 * 1000;
/** Teto por chamada nativa do notifee no encerramento (elas podem não responder). */
const NOTIFEE_CALL_TIMEOUT_MS = 10_000;
/** Se o handler não iniciar nesse tempo depois de exibir a notificação, algo deu errado. */
const FGS_START_TIMEOUT_MS = 30_000;

// Fila dinâmica: novos manhwas podem ser adicionados a qualquer momento e os
// workers em execução os pegam. inFlight = ids sendo baixados agora (dedupe).
let currentQueue: Manhwa[] = [];
const inFlight = new Set<number>();
let running = false;

/**
 * Geração da sessão de download. É incrementada ao encerrar o serviço (normal ou
 * por watchdog) e ao parar manualmente. Workers do `drainQueue` comparam a geração
 * a cada volta: se a sessão deles já morreu, saem. Sem isso, um worker preso numa
 * operação nativa que só responde depois do encerramento voltaria a consumir a
 * fila da sessão SEGUINTE (download duplicado + progresso fantasma).
 */
let queueGeneration = 0;

/**
 * Roda `p` com teto de tempo. NUNCA rejeita nem fica pendente: erro ou estouro
 * devolvem `fallback` (e logam). É o que garante que nenhuma etapa do
 * encerramento deixe a promise do foreground service pendente pra sempre.
 */
async function settleWithin<T>(p: Promise<T>, ms: number, label: string, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            p.catch((e: unknown) => {
                console.warn(`[fgs] ${label} falhou:`, e);
                return fallback;
            }),
            new Promise<T>((res) => {
                timer = setTimeout(() => {
                    console.warn(`[fgs] ${label} não respondeu em ${ms}ms — seguindo sem esperar`);
                    res(fallback);
                }, ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Drena a fila com workers em paralelo, pegando itens adicionados durante a execução. */
async function drainQueue(gen: number): Promise<{ done: number; errors: number }> {
    let done = 0;
    let errors = 0;
    const worker = async () => {
        while (true) {
            if (gen !== queueGeneration) return; // sessão encerrada por watchdog/parada
            if (isCancelRequested()) { currentQueue.length = 0; return; }
            const m = currentQueue.shift();
            if (!m) return;
            inFlight.add(m.id);
            try {
                const r = await downloadManhwa(m);
                done += r.downloaded;
                errors += r.errors;
            } catch (e) {
                console.warn('[fgs] downloadManhwa falhou:', e);
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
    } while (currentQueue.length > 0 && !isCancelRequested() && gen === queueGeneration);
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

// Throttle da notificação de progresso. `notifTimer` pendente = já há um post
// agendado; ele lê o `aggregate()` na hora de disparar, então os emits que
// chegarem no meio do caminho são absorvidos por esse mesmo post.
let notifTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifAt = 0;
let lastNotifKey = '';

function clearNotifTimer(): void {
    if (notifTimer) {
        clearTimeout(notifTimer);
        notifTimer = null;
    }
}

/** Agenda uma atualização da notificação respeitando o NOTIF_THROTTLE_MS. */
function scheduleProgressNotification(): void {
    if (notifTimer) return;
    const wait = Math.max(0, NOTIF_THROTTLE_MS - (Date.now() - lastNotifAt));
    notifTimer = setTimeout(() => {
        notifTimer = null;
        lastNotifAt = Date.now();
        const { done, total } = aggregate();
        const key = `${done}/${total}`;
        // Nada mudou desde o último post: não repõe a notificação à toa.
        if (key === lastNotifKey) return;
        lastNotifKey = key;
        showProgressNotification().catch(e => console.warn('[fgs] progresso:', e));
    }, wait);
}

async function showDoneNotification(done: number, errors: number, aborted: boolean): Promise<void> {
    const title = aborted
        ? 'Download interrompido'
        : errors > 0 ? 'Download concluído com erros' : 'Download concluído';
    const body = errors > 0
        ? `${done} capítulos baixados · ${errors} manhwa(s) com erro`
        : `${done} capítulos baixados`;
    await notifee.displayNotification({
        id: PROGRESS_NOTIF_ID,
        title,
        body,
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

/** Handler do foreground service em execução (guarda contra reentrância). */
let fgsActive = false;

// Registra o handler do foreground service no escopo do módulo (uma vez).
// Esse handler roda enquanto a notificação asForegroundService está visível.
//
// ⚠️ CONTRATO: a promise devolvida aqui é o que mantém o serviço vivo. Enquanto
// ela estiver pendente, o Android segura o processo com wake lock. Se ela NUNCA
// resolver (download travado numa operação nativa sem timeout, exceção no meio
// do encerramento, `stopForegroundService` que não responde), o serviço roda
// indefinidamente — foi essa a causa do device entrar em colapso depois de ~1h.
// Portanto: TODO caminho tem que chegar em `resolve()`, e há dois watchdogs
// (inatividade e tempo máximo) que forçam o encerramento.
if (Platform.OS === 'android' && notifee) {
    try {
        notifee.registerForegroundService(() => new Promise<void>((resolve) => {
            // Reentrância: o Android pode reentregar o start do serviço (e o notifee
            // redisparar a task). Uma segunda instância criaria um segundo drainQueue
            // e um segundo listener do store — que é como o flood de notificações se
            // multiplicava. Resolve na hora e deixa a instância viva terminar.
            if (fgsActive) {
                console.warn('[fgs] handler já ativo — reentrada ignorada');
                resolve();
                return;
            }
            fgsActive = true;

            const gen = queueGeneration;
            const startedAt = Date.now();
            console.log(`[fgs] handler iniciado (geração ${gen}, ${currentQueue.length} na fila)`);

            let settled = false;
            let unsub: () => void = () => {};
            let stallTimer: ReturnType<typeof setTimeout> | null = null;
            let maxTimer: ReturnType<typeof setTimeout> | null = null;

            /**
             * Encerra a sessão e resolve a promise. Idempotente e à prova de exceção:
             * o `resolve()` está no `finally`, então nenhum erro aqui dentro deixa o
             * serviço pendurado.
             */
            const finish = async (reason: string, done: number, errors: number): Promise<void> => {
                if (settled) return;
                settled = true;
                const secs = Math.round((Date.now() - startedAt) / 1000);
                const aborted = reason !== 'fila-drenada';
                console.log(`[fgs] encerrando (${reason}) após ${secs}s — ${done} caps, ${errors} erros`);

                try {
                    if (stallTimer) clearTimeout(stallTimer);
                    if (maxTimer) clearTimeout(maxTimer);
                    clearNotifTimer();
                    try { unsub(); } catch (e) { console.warn('[fgs] unsubscribe:', e); }

                    // Mata a sessão: workers zumbis do drainQueue saem na próxima volta.
                    queueGeneration++;
                    if (aborted) {
                        currentQueue = [];
                        requestCancel();
                    }

                    // Passo crítico: sem isso o Android mantém o processo em foreground.
                    const stopped = await settleWithin(
                        notifee.stopForegroundService().then(() => true),
                        NOTIFEE_CALL_TIMEOUT_MS, 'stopForegroundService', false
                    );
                    console.log(`[fgs] stopForegroundService ${stopped ? 'completou' : 'NÃO completou'}`);
                    if (!stopped) {
                        // Cancelar a notificação também derruba o serviço — última tentativa.
                        await settleWithin(
                            notifee.cancelNotification(PROGRESS_NOTIF_ID).then(() => true),
                            NOTIFEE_CALL_TIMEOUT_MS, 'cancelNotification', false
                        );
                    }

                    await settleWithin(
                        showDoneNotification(done, errors, aborted).then(() => true),
                        NOTIFEE_CALL_TIMEOUT_MS, 'showDoneNotification', false
                    );
                } catch (e) {
                    console.warn('[fgs] erro no encerramento:', e);
                } finally {
                    // Só liberamos a trava DEPOIS do teardown: se `running`/`fgsActive`
                    // caíssem antes, um toque durante os aguardos acima subiria uma
                    // sessão nova que o `stopForegroundService` desta aqui derrubaria.
                    running = false;
                    fgsActive = false;
                    console.log(`[fgs] promise resolvida (${reason})`);
                    resolve();
                }
            };

            // Watchdog de inatividade: rearmado a cada progresso no store. Cobre o
            // caso real de travamento — operação de rede nativa que não responde
            // (ex.: a VPN cai e o host do backend some), deixando o download pendente.
            const armStall = () => {
                if (settled) return;
                if (stallTimer) clearTimeout(stallTimer);
                stallTimer = setTimeout(() => {
                    console.warn(`[fgs] sem progresso por ${FGS_STALL_TIMEOUT_MS / 60000}min — abortando`);
                    void finish('travado', 0, 0);
                }, FGS_STALL_TIMEOUT_MS);
            };

            // Teto absoluto: mesmo com progresso, o serviço não vive mais que isso.
            maxTimer = setTimeout(() => {
                console.warn(`[fgs] tempo máximo (${FGS_MAX_RUNTIME_MS / 3600000}h) atingido — abortando`);
                void finish('tempo-maximo', 0, 0);
            }, FGS_MAX_RUNTIME_MS);

            try {
                unsub = subscribeStore(() => {
                    armStall();
                    scheduleProgressNotification();
                });
            } catch (e) {
                console.warn('[fgs] subscribeStore falhou:', e);
            }
            armStall();

            void (async () => {
                let done = 0;
                let errors = 0;
                try {
                    const r = await drainQueue(gen);
                    done = r.done;
                    errors = r.errors;
                } catch (e) {
                    console.warn('[fgs] drainQueue falhou:', e);
                    errors++;
                }
                await finish('fila-drenada', done, errors);
            })();
        }));
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
    resetCancel(); // nova sessão de download
    lastNotifKey = '';
    lastNotifAt = 0;

    try {
        await notifee.requestPermission();
        await ensureChannel();
        // Exibir a notificação asForegroundService inicia o serviço, que dispara
        // o handler registrado acima (que chama drainQueue).
        await showProgressNotification();
        // Se o handler não subir, o serviço ficaria "no ar" sem ninguém baixando e
        // com `running` travado em true (nenhum toque novo reiniciaria). Solta a
        // trava e registra — é o sintoma que o log precisa mostrar.
        const gen = queueGeneration;
        setTimeout(() => {
            if (!fgsActive && running && gen === queueGeneration) {
                console.warn('[fgs] handler não iniciou em 30s — liberando pra nova tentativa');
                running = false;
            }
        }, FGS_START_TIMEOUT_MS);
    } catch (e) {
        console.warn('[bg-download] falha ao iniciar serviço:', e);
        running = false;
        const fallback = [...currentQueue];
        currentQueue = [];
        // Fallback: roda in-app pra não deixar o usuário sem download.
        await downloadAll(fallback).catch(() => {});
    }
}

/**
 * Para o download: esvazia a fila, pede cancelamento (o capítulo atual termina
 * e é salvo, o resto é abortado) e encerra o foreground service.
 */
export async function stopBackgroundDownload(): Promise<void> {
    console.log('[fgs] parada solicitada pelo usuário');
    currentQueue = [];
    requestCancel();
    running = false;
    clearNotifTimer();
    // Mata a sessão pra que o drainQueue em andamento saia na próxima volta —
    // o handler então resolve a promise sozinho e o serviço cai.
    queueGeneration++;
    if (notifee) {
        const stopped = await settleWithin(
            notifee.stopForegroundService().then(() => true),
            NOTIFEE_CALL_TIMEOUT_MS, 'stopForegroundService (parada)', false
        );
        console.log(`[fgs] parada: stopForegroundService ${stopped ? 'completou' : 'NÃO completou'}`);
    }
}
