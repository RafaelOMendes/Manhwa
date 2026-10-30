import React from 'react';
import CbzReader from './CbzReader';
import { useReaderRequest, navigateReader, closeReader } from '../lib/reader-store';

/**
 * Renderiza o CbzReader UMA vez na raiz do app (fora de qualquer Modal), pra
 * que o modo imersivo (esconder barras) valha pra janela única da activity.
 * Key por manhwa + capítulo: REMONTA a cada troca de capítulo. O leitor antigo
 * desmonta inteiro no mesmo commit (o React processa a deleção antes da
 * inserção e as cleanups antes dos efeitos novos), e as páginas do próximo só
 * montam depois do carregamento assíncrono dele, então as views antigas já
 * foram destruídas quando a primeira página nova aparece. A liberação da
 * memória de imagem fica no unmount do CbzReader (`releaseImageMemory`), que
 * cobre fechar, trocar de capítulo e qualquer `closeReader`/`openReader`
 * externo. Fechar zera o store (`request: null`), então nada do capítulo fica
 * referenciado aqui.
 */
export default function ReaderHost() {
    const request = useReaderRequest();
    if (!request) return null;
    return (
        <CbzReader
            key={`${request.manhwaId}:${request.filename}`}
            manhwaId={request.manhwaId}
            filename={request.filename}
            chapterNumber={request.chapterNumber}
            files={request.files}
            onClose={() => {
                request.onClose?.();
                closeReader();
            }}
            onChapterRead={request.onChapterRead}
            onNavigate={(filename, chapterNum) => navigateReader(filename, chapterNum)}
        />
    );
}
