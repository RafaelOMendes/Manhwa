export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE ??
    (typeof window !== 'undefined' ? `http://${window.location.hostname}:8000` : 'http://localhost:8000');

// Token de acesso à API. Vazio em dev local (auth desligada no backend).
// No deploy, defina NEXT_PUBLIC_API_TOKEN com o mesmo valor de API_TOKEN do backend.
export const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? '';

// Headers com o token (para chamadas fetch). Mescla com headers extras.
export function authHeaders(extra?: HeadersInit): HeadersInit {
    if (!API_TOKEN) return extra ?? {};
    return { ...(extra as Record<string, string> | undefined), Authorization: `Bearer ${API_TOKEN}` };
}

// Anexa ?token= em URLs usadas como <img src> (não conseguem enviar header).
export function withToken(url: string): string {
    if (!API_TOKEN) return url;
    return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(API_TOKEN);
}
