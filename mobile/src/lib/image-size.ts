import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

/**
 * Largura/altura de página lidas SÓ do cabeçalho do arquivo — sem decodificar
 * pixels. Base do pré-cálculo de alturas do leitor (`CbzReader`).
 *
 * 🚨 Substitui o `RNImage.getSize`, que era a causa da RAM estourando ao abrir
 * capítulos: no Android (RN 0.81, `ImageLoaderModule.getSize`) ele chama
 * `fetchDecodedImage` do Fresco SEM `ResizeOptions` — decodifica o bitmap
 * INTEIRO de cada página (800×10000 ARGB ≈ 32MB) num segundo pipeline de
 * imagem, separado do Glide que o expo-image usa pra renderizar. O resultado
 * ficava no cache de memória do Fresco, que o RN não liga a nenhum trim por
 * pressão de memória (só limpa no `onHostDestroy`) e que o
 * `Image.clearMemoryCache()` do expo-image não alcança (só limpa o Glide). Como
 * o leitor mede o capítulo inteiro a cada abertura, a memória nativa subia a
 * cada capítulo aberto.
 *
 * Formatos: os mesmos que o download extrai do .cbz (`IMAGE_EXTS` em
 * `cache.ts`) — JPEG, PNG, GIF, WebP e BMP. Em disco a extensão é sempre
 * `.jpg`, então o formato vem dos magic bytes, não do nome. Orientação EXIF é
 * ignorada (raríssima em página de manhwa); se aparecer, o `onLoad` da página
 * corrige a altura dela ao decodificar.
 */

export interface ImageSize {
    w: number;
    h: number;
}

type ReadAt = (position: number, length: number) => Promise<Uint8Array>;

// Primeira leitura: cobre PNG/GIF/WebP/BMP (< 32 bytes) e o SOF da maioria dos
// JPEGs. JPEG com EXIF/ICC grande pede leituras extras, sempre a partir do
// próximo marcador (o segmento em si é pulado, nunca lido).
const HEADER_CHUNK = 16 * 1024;
const MAX_READS = 12;

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64_ALPHABET.length; i++) B64_LOOKUP[B64_ALPHABET.charCodeAt(i)] = i;

function base64ToBytes(b64: string): Uint8Array {
    let len = b64.length;
    while (len > 0 && b64.charCodeAt(len - 1) === 61 /* '=' */) len--;
    const out = new Uint8Array((len * 3) >> 2);
    let o = 0;
    for (let i = 0; i < len; i += 4) {
        // Fora do fim da string `charCodeAt` dá NaN → lookup `undefined` → 0 nas
        // operações de bit; os bytes extras são descartados pelo limite de `out`.
        const a = B64_LOOKUP[b64.charCodeAt(i)];
        const b = B64_LOOKUP[b64.charCodeAt(i + 1)];
        const c = B64_LOOKUP[b64.charCodeAt(i + 2)];
        const d = B64_LOOKUP[b64.charCodeAt(i + 3)];
        out[o++] = (a << 2) | (b >> 4);
        if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
        if (o < out.length) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const i32le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const ascii = (b: Uint8Array, i: number, s: string) => {
    for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false;
    return true;
};

function sized(w: number, h: number): ImageSize | null {
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : null;
}

async function jpegSize(first: Uint8Array, readAt: ReadAt): Promise<ImageSize | null> {
    let buf = first;
    let bufStart = 0;
    let reads = 1;
    let pos = 2; // depois do SOI (FF D8)

    // Garante `buf` cobrindo [pos, pos + n): quando o próximo marcador cai fora
    // do bloco em memória, lê um bloco novo começando nele.
    const ensure = async (n: number): Promise<boolean> => {
        if (pos >= bufStart && pos + n <= bufStart + buf.length) return true;
        if (reads >= MAX_READS) return false;
        reads++;
        buf = await readAt(pos, HEADER_CHUNK);
        bufStart = pos;
        return buf.length >= n;
    };

    for (;;) {
        // 9 bytes = FF Cx + tamanho(2) + precisão(1) + altura(2) + largura(2).
        if (!(await ensure(9))) return null;
        const i = pos - bufStart;
        if (buf[i] !== 0xFF) return null;
        const marker = buf[i + 1];
        if (marker === 0xFF) { pos += 1; continue; } // byte de preenchimento
        if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { pos += 2; continue; }
        // Chegou nos dados da imagem (SOS) ou no fim (EOI) sem achar o SOF.
        if (marker === 0xD9 || marker === 0xDA) return null;
        // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC), que não são frame.
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            return sized(u16be(buf, i + 7), u16be(buf, i + 5));
        }
        const segLen = u16be(buf, i + 2);
        if (segLen < 2) return null;
        pos += 2 + segLen;
    }
}

async function parseImageSize(first: Uint8Array, readAt: ReadAt): Promise<ImageSize | null> {
    if (first.length >= 4 && first[0] === 0xFF && first[1] === 0xD8) {
        return jpegSize(first, readAt);
    }
    if (first.length >= 24 && first[0] === 0x89 && ascii(first, 1, 'PNG') && ascii(first, 12, 'IHDR')) {
        return sized(u32be(first, 16), u32be(first, 20));
    }
    if (first.length >= 10 && ascii(first, 0, 'GIF8')) {
        return sized(u16le(first, 6), u16le(first, 8));
    }
    if (first.length >= 30 && ascii(first, 0, 'RIFF') && ascii(first, 8, 'WEBP')) {
        if (ascii(first, 12, 'VP8 ')) {
            return sized(u16le(first, 26) & 0x3FFF, u16le(first, 28) & 0x3FFF);
        }
        if (ascii(first, 12, 'VP8L') && first[20] === 0x2F) {
            const w = 1 + (((first[22] & 0x3F) << 8) | first[21]);
            const h = 1 + (((first[24] & 0x0F) << 10) | (first[23] << 2) | ((first[22] & 0xC0) >> 6));
            return sized(w, h);
        }
        if (ascii(first, 12, 'VP8X')) {
            return sized(1 + u24le(first, 24), 1 + u24le(first, 27));
        }
        return null;
    }
    if (first.length >= 26 && ascii(first, 0, 'BM')) {
        // BITMAPCOREHEADER (12 bytes) usa 16 bits; os demais, 32 bits com sinal
        // (altura negativa = imagem de cima pra baixo).
        if (i32le(first, 14) === 12) return sized(u16le(first, 18), u16le(first, 20));
        return sized(i32le(first, 18), Math.abs(i32le(first, 22)));
    }
    return null;
}

// API legacy de propósito: `readAsStringAsync` com `position`/`length` é
// ASSÍNCRONA (lê fora da thread JS) e só-leitura. O `File.open()` da API nova é
// síncrono e abre com `RandomAccessFile(..., "rw")`, que CRIA o arquivo se ele
// não existir — mascararia página faltando pro `cleanupCorrupted`.
async function readFileRange(uri: string, position: number, length: number): Promise<Uint8Array> {
    const b64 = await LegacyFS.readAsStringAsync(uri, {
        encoding: LegacyFS.EncodingType.Base64,
        position,
        length,
    });
    return base64ToBytes(b64);
}

/** Largura/altura de uma imagem local (`file://`). `null` se não reconhecer o formato ou falhar. */
export async function readImageSize(uri: string): Promise<ImageSize | null> {
    try {
        const readAt: ReadAt = (position, length) => readFileRange(uri, position, length);
        return await parseImageSize(await readAt(0, HEADER_CHUNK), readAt);
    } catch {
        return null;
    }
}

// `File.downloadFileAsync` não tem timeout próprio (ver AGENTS.md, "Timeouts de
// rede"): sem teto, um socket travado prenderia o worker do pré-cálculo pra sempre.
const REMOTE_PROBE_TIMEOUT_MS = 15_000;
let probeSessionSeq = 0;

/**
 * Medição de páginas NÃO baixadas. O backend serve a página inteira (sem
 * suporte a Range), então não dá pra ler só o cabeçalho pela rede: baixa pra
 * um arquivo temporário e mede com `readImageSize`. É o mesmo tráfego que o
 * `getSize` já fazia (o Fresco também baixava cada página), mas sem decodificar
 * nada — o download escreve direto no disco, memória constante.
 *
 * Uma pasta por sessão (`dispose()` apaga a pasta toda): um download que estoura
 * o timeout continua no nativo, e assim a sobra dele não fica esquecida no cache
 * nem colide com os arquivos da sessão seguinte (troca de capítulo).
 */
export class RemoteImageSizeProbe {
    private readonly dir = new Directory(Paths.cache, 'reader-probe', `${Date.now()}_${probeSessionSeq++}`);
    private seq = 0;

    async measure(url: string): Promise<ImageSize | null> {
        const tmp = new File(this.dir, `page_${this.seq++}`);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            if (!this.dir.exists) this.dir.create({ intermediates: true, idempotent: true });
            await Promise.race([
                File.downloadFileAsync(url, tmp, { idempotent: true }),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('timeout medindo página')), REMOTE_PROBE_TIMEOUT_MS);
                }),
            ]);
            return await readImageSize(tmp.uri);
        } catch {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
            try { if (tmp.exists) tmp.delete(); } catch {}
        }
    }

    dispose(): void {
        LegacyFS.deleteAsync(this.dir.uri, { idempotent: true }).catch(() => {});
    }
}
