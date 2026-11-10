// Teste das peças puras do download por página. Roda em Node 22.6+ (type stripping):
//   node src/lib/__tests__/page-pool.test.mjs
import assert from 'node:assert/strict';
import { createLimiter, runPages, withTimeout } from '../page-pool.ts';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
async function test(name, fn) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}

await test('limiter nunca passa do máximo e roda tudo', async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const done = [];
    await Promise.all(Array.from({ length: 20 }, (_, i) => limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await sleep(2 + (i % 4));
        running--;
        done.push(i);
    })));
    assert.equal(peak, 3);
    assert.equal(done.length, 20);
});

await test('limiter libera a vaga quando a tarefa lança', async () => {
    const limit = createLimiter(1);
    await assert.rejects(limit(async () => { throw new Error('x'); }), /x/);
    assert.equal(await limit(async () => 42), 42);
});

await test('runPages cobre todos os índices uma vez só', async () => {
    const seen = [];
    await runPages(37, 4, async (i) => { await sleep(1); seen.push(i); });
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
});

await test('runPages respeita concorrência local e o limiter global juntos', async () => {
    const global = createLimiter(2);
    let running = 0;
    let peak = 0;
    const chapter = () => runPages(10, 4, async () => {
        running++;
        peak = Math.max(peak, running);
        await sleep(3);
        running--;
    }, global);
    await Promise.all([chapter(), chapter(), chapter()]);
    assert.equal(peak, 2);
});

await test('runPages para na primeira falha e propaga', async () => {
    const started = [];
    await assert.rejects(
        runPages(50, 3, async (i) => {
            started.push(i);
            await sleep(2);
            if (i === 4) throw new Error('página 4');
        }),
        /página 4/,
    );
    assert.ok(started.length < 50, `parou cedo (${started.length} iniciadas)`);
});

await test('runPages com 0 páginas resolve na hora', async () => {
    let calls = 0;
    await runPages(0, 3, async () => { calls++; });
    assert.equal(calls, 0);
});

await test('withTimeout rejeita no prazo e não deixa timer vivo', async () => {
    const t0 = Date.now();
    await assert.rejects(withTimeout(new Promise(() => {}), 30, 'estourou'), /estourou/);
    assert.ok(Date.now() - t0 < 200);
    assert.equal(await withTimeout(Promise.resolve('ok'), 1000, 'x'), 'ok');
});

console.log(`\n${passed} testes passaram`);
