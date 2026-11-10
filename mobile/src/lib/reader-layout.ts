/**
 * Layout EXATO das páginas do leitor (puro, sem React Native: testado em Node,
 * `node src/lib/__tests__/reader-layout.test.mjs`).
 *
 * Com a altura de todas as páginas conhecida ANTES de montar a lista, a
 * FlatList recebe `getItemLayout` e passa a saber o tamanho do capítulo inteiro
 * desde o primeiro frame. Isso é o que faz o botão de descer e a volta pro ponto
 * de leitura funcionarem com um `scrollToOffset` direto: sem `getItemLayout`, a
 * VirtualizedList limita o espaço reservado ao que ela já MEDIU (montou), e
 * qualquer scroll pra além disso parava "onde a lista terminou de carregar".
 */

export interface ReaderLayout {
    /** Altura de cada página, em dp. */
    heights: number[];
    /** Topo de cada página, em dp (`offsets[i] = soma de heights[0..i-1]`). */
    offsets: number[];
    /** Soma das alturas (sem o rodapé da lista). */
    total: number;
    /** Páginas que não deu pra medir (ficaram com a proporção de reserva). */
    unmeasured: number;
}

/** Proporção largura/altura usada quando uma página não pôde ser medida. */
export const FALLBACK_RATIO = 0.7;

/**
 * `page_sizes` do backend (`[[w, h] | null, ...]`) → proporções. `null` se o
 * formato não for o esperado ou o tamanho não bater com `total`, porque um
 * layout desalinhado é pior que nenhum. Página inválida vira `null` (reserva).
 */
export function ratiosFromSizes(sizes: unknown, total: number): (number | null)[] | null {
    if (!Array.isArray(sizes) || sizes.length !== total || total <= 0) return null;
    return sizes.map(s => {
        if (!Array.isArray(s) || s.length < 2) return null;
        const w = Number(s[0]);
        const h = Number(s[1]);
        return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : null;
    });
}

/** Proporções (largura/altura; `null` = não medida) → alturas e topos na largura `width`. */
export function buildLayout(ratios: (number | null)[], width: number): ReaderLayout {
    const heights: number[] = new Array(ratios.length);
    const offsets: number[] = new Array(ratios.length);
    let total = 0;
    let unmeasured = 0;
    for (let i = 0; i < ratios.length; i++) {
        let r = ratios[i];
        if (r === null || !Number.isFinite(r) || r <= 0) {
            r = FALLBACK_RATIO;
            unmeasured++;
        }
        const h = width / r;
        offsets[i] = total;
        heights[i] = h;
        total += h;
    }
    return { heights, offsets, total, unmeasured };
}

/**
 * Onde pousar ao voltar pro ponto de leitura. Nunca além de
 * `total - viewport - endGap`: um offset salvo maior que o capítulo (valor
 * antigo medido com outra largura de tela, ou de outra versão do arquivo) levava
 * direto pro fim — o "teleporte". E não chega na zona que marca como lido.
 */
export function clampRestoreOffset(saved: number, total: number, viewport: number, endGap: number): number {
    if (!Number.isFinite(saved) || saved <= 0 || total <= 0) return 0;
    const max = Math.max(total - viewport - endGap, 0);
    return Math.min(saved, max);
}

/** Alvo do botão "ir pro fim": perto do fim, antes da zona que marca como lido. */
export function bottomTarget(total: number, viewport: number, endGap: number): number {
    return Math.max(total - viewport - endGap, 0);
}
