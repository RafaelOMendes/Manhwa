import React from 'react';
import CbzReader from './CbzReader';
import { useReaderRequest, navigateReader, closeReader } from '../lib/reader-store';

/**
 * Renderiza o CbzReader UMA vez na raiz do app (fora de qualquer Modal), pra
 * que o modo imersivo (esconder barras) valha pra janela única da activity.
 * Mantém o leitor montado entre capítulos (key por manhwaId).
 */
export default function ReaderHost() {
    const request = useReaderRequest();
    if (!request) return null;
    return (
        <CbzReader
            key={request.manhwaId}
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
