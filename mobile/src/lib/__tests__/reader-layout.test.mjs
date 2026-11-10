// Teste do layout exato do leitor. Roda em Node 22.6+ (type stripping):
//   node src/lib/__tests__/reader-layout.test.mjs
import assert from 'node:assert/strict';
import {
    buildLayout, ratiosFromSizes, clampRestoreOffset, bottomTarget, FALLBACK_RATIO,
} from '../reader-layout.ts';

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('alturas e topos acumulam na ordem', () => {
    const l = buildLayout([800 / 15000, 1080 / 2016, 0.5], 400);
    close(l.heights[0], 400 * 15000 / 800);
    close(l.heights[1], 400 * 2016 / 1080);
    close(l.heights[2], 800);
    assert.equal(l.offsets[0], 0);
    close(l.offsets[1], l.heights[0]);
    close(l.offsets[2], l.heights[0] + l.heights[1]);
    close(l.total, l.heights[0] + l.heights[1] + l.heights[2]);
    assert.equal(l.unmeasured, 0);
});

test('página sem medida usa a proporção de reserva e é contada', () => {
    const l = buildLayout([null, NaN, 0, -1, 1], 350);
    for (let i = 0; i < 4; i++) close(l.heights[i], 350 / FALLBACK_RATIO);
    close(l.heights[4], 350);
    assert.equal(l.unmeasured, 4);
});

test('capítulo vazio', () => {
    const l = buildLayout([], 400);
    assert.equal(l.total, 0);
    assert.deepEqual(l.heights, []);
});

test('page_sizes do backend vira proporções', () => {
    assert.deepEqual(ratiosFromSizes([[800, 400], null, [0, 10], ['a', 1], [1080, 2160]], 5), [2, null, null, null, 0.5]);
});

test('page_sizes com tamanho errado ou formato estranho é descartado', () => {
    assert.equal(ratiosFromSizes([[1, 1]], 2), null);
    assert.equal(ratiosFromSizes(undefined, 3), null);
    assert.equal(ratiosFromSizes('x', 1), null);
    assert.equal(ratiosFromSizes([], 0), null);
});

test('restore nunca passa do fim nem cai na zona de lido', () => {
    assert.equal(clampRestoreOffset(5000, 20000, 800, 220), 5000);
    assert.equal(clampRestoreOffset(99999, 20000, 800, 220), 20000 - 800 - 220);
    assert.equal(clampRestoreOffset(-3, 20000, 800, 220), 0);
    assert.equal(clampRestoreOffset(NaN, 20000, 800, 220), 0);
    assert.equal(clampRestoreOffset(500, 600, 800, 220), 0);
});

test('alvo do ir-pro-fim', () => {
    assert.equal(bottomTarget(20000, 800, 220), 18980);
    assert.equal(bottomTarget(500, 800, 220), 0);
});

test('getItemLayout bate com a soma (capítulo grande)', () => {
    const ratios = Array.from({ length: 135 }, (_, i) => (i % 7 === 0 ? null : 800 / (1500 + i * 13)));
    const l = buildLayout(ratios, 411.4);
    for (let i = 1; i < 135; i++) close(l.offsets[i], l.offsets[i - 1] + l.heights[i - 1]);
    close(l.total, l.offsets[134] + l.heights[134]);
});

console.log(`\n${passed} testes passaram`);
