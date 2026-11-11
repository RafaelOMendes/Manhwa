/**
 * Peças PURAS do download por página (sem React Native, sem disco): dá pra
 * testar em Node. Ver `downloadChapter` em `cache.ts` e o teste em
 * `__tests__/page-pool.test.mjs` (`node src/lib/__tests__/page-pool.test.mjs`).
 */

export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Semáforo: no máximo `max` tarefas ao mesmo tempo, as outras esperam em ordem
 * de chegada. Uma tarefa que lança libera a vaga do mesmo jeito.
 */
export function createLimiter(max: number): Limiter {
    let running = 0;
    const waiting: (() => void)[] = [];
    const release = () => {
        running--;
        const next = waiting.shift();
        if (next) next();
    };
    return async <T>(fn: () => Promise<T>): Promise<T> => {
        if (running >= max) {
            await new Promise<void>(resolve => waiting.push(resolve));
        }
        running++;
        try {
            return await fn();
        } finally {
            release();
        }
    };
}

/**
 * Roda `task(i)` pra `i` em `0..total-1`, com no máximo `concurrency` de cada
 * vez (e cada uma ainda passando pelo `limiter` global, se houver). Na PRIMEIRA
 * falha para de puxar índices novos, espera as que já estavam rodando e lança
 * essa falha: um capítulo com página faltando não pode ser dado como baixado.
 */
export async function runPages(
    total: number,
    concurrency: number,
    task: (index: number) => Promise<void>,
    limiter?: Limiter,
): Promise<void> {
    let next = 0;
    let failure: { error: unknown } | null = null;
    const worker = async () => {
        while (!failure) {
            const i = next++;
            if (i >= total) return;
            try {
                await (limiter ? limiter(() => task(i)) : task(i));
            } catch (error) {
                if (!failure) failure = { error };
                return;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker));
    if (failure) throw (failure as { error: unknown }).error;
}

/**
 * Erro do `withTimeout`. Diferente de uma falha da própria operação, aqui ela
 * NÃO terminou: continua rodando por baixo (um download nativo segue escrevendo
 * no arquivo). Quem tenta de novo precisa saber disso: ver `retryUnlessTimeout`.
 */
export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/**
 * Tenta `fn` até `retries` vezes a mais, esperando `delayMs × tentativa` entre
 * elas. NÃO repete depois de `TimeoutError` (a tentativa anterior ainda está
 * viva e escrevendo no mesmo arquivo: duas escritas juntas corromperiam a
 * página) nem quando `shouldStop()` vira verdadeiro.
 */
export async function retryUnlessTimeout<T>(
    fn: (attempt: number) => Promise<T>,
    retries: number,
    delayMs: number,
    shouldStop: () => boolean = () => false,
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            if (error instanceof TimeoutError || attempt >= retries || shouldStop()) throw error;
            await new Promise<void>(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
            if (shouldStop()) throw error;
        }
    }
}

/** Rejeita com `TimeoutError(message)` se `promise` não terminar em `ms`; o timer é sempre limpo. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new TimeoutError(message)), ms);
        }),
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}
