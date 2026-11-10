import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { useMemoryLabel } from '../lib/memory';

interface MemoryLabelProps {
    style?: StyleProp<TextStyle>;
    /** Com `false` não lê `/proc` nem agenda timer. */
    active?: boolean;
    intervalMs?: number;
}

/**
 * Linha `RAM app 412 MB · livre 3.1 GB` (ver `lib/memory.ts`). Componente à
 * parte de propósito: o estado que muda a cada leitura fica AQUI, então só este
 * `Text` re-renderiza, e não a home ou o leitor inteiro.
 *
 * Serve pra conferir o vazamento de páginas do leitor sem logcat: `livre` não
 * pode ir caindo capítulo após capítulo, e tem que voltar ao fechar o leitor.
 * Some sozinho onde `/proc` não é legível.
 */
export default function MemoryLabel({ style, active = true, intervalMs }: MemoryLabelProps) {
    const label = useMemoryLabel(active, intervalMs);
    if (!label) return null;
    return <Text style={style} numberOfLines={1}>RAM {label}</Text>;
}
