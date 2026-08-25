import asyncio
import os
import re
import html
import time
from telethon import TelegramClient
from telethon.tl.types import MessageService, MessageActionTopicCreate, Message, DocumentAttributeFilename
from telethon.tl.functions.channels import GetForumTopicsByIDRequest
from telethon.errors import (
    ChannelInvalidError,
    ChannelPrivateError,
    ChatAdminRequiredError,
    ChatForbiddenError,
    FloodWaitError,
    RPCError,
)

# ---------------------------------------------------------------------------
# Tipos de erro de `_get_topic_stats()`
#
# O caller (ex.: /api/manhwas/review-all) precisa distinguir "esse tópico está
# legitimamente vazio" de "não consegui ler o tópico" — antes tudo virava
# `cbz_count = 0` sem contexto e o endpoint tratava os dois casos como falha.
# ---------------------------------------------------------------------------
ERROR_INVALID_LINK = "invalid_link"        # link malformado, nem dá pra extrair chat_id/topic_id
ERROR_ENTITY_NOT_FOUND = "entity_not_found"  # chat/tópico não existe (ou foi apagado)
ERROR_PRIVATE_TOPIC = "private_topic"      # existe, mas a conta não tem acesso
ERROR_FLOOD_WAIT = "flood_wait"            # Telegram pediu pra esperar (429)
ERROR_TIMEOUT = "timeout"                  # estourou o tempo lendo as mensagens
ERROR_NETWORK = "network"                  # queda de conexão com o Telegram
ERROR_UNKNOWN = "unknown"                  # não classificado — tratado como temporário
EMPTY_TOPIC = "empty"                      # leitura OK, mas o tópico não tem nenhum .cbz

# Não adianta repetir: o problema é do link/permissão, não do momento.
DEFINITIVE_ERROR_TYPES = frozenset({
    ERROR_INVALID_LINK,
    ERROR_ENTITY_NOT_FOUND,
    ERROR_PRIVATE_TOPIC,
})

# Vale um retry: provavelmente funciona daqui a pouco.
TEMPORARY_ERROR_TYPES = frozenset({
    ERROR_FLOOD_WAIT,
    ERROR_TIMEOUT,
    ERROR_NETWORK,
    ERROR_UNKNOWN,
})


def classify_telegram_error(exc: BaseException) -> tuple:
    """Traduz uma exceção do Telethon num `(error_type, error_message)` legível.

    Existe para o caller poder decidir o que fazer com a falha (registrar e
    seguir em frente vs. tentar de novo) sem ter que inspecionar exceções do
    Telethon por conta própria.
    """
    if isinstance(exc, (ChannelPrivateError, ChatAdminRequiredError, ChatForbiddenError)):
        return ERROR_PRIVATE_TOPIC, f"Sem permissão para ler o tópico: {exc}"

    if isinstance(exc, ChannelInvalidError):
        return ERROR_ENTITY_NOT_FOUND, f"Canal/tópico inválido ou inexistente: {exc}"

    if isinstance(exc, FloodWaitError):
        return ERROR_FLOOD_WAIT, f"Telegram pediu para aguardar {exc.seconds}s (flood wait)."

    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return ERROR_TIMEOUT, f"Timeout ao ler o tópico: {exc}"

    if isinstance(exc, ValueError):
        # get_entity() levanta ValueError puro quando não acha o peer.
        texto = str(exc).lower()
        if "entity" in texto or "peer" in texto or "not found" in texto:
            return ERROR_ENTITY_NOT_FOUND, f"Entidade não encontrada: {exc}"
        return ERROR_UNKNOWN, f"Erro inesperado: {exc}"

    if isinstance(exc, (ConnectionError, OSError)):
        return ERROR_NETWORK, f"Falha de conexão com o Telegram: {exc}"

    if isinstance(exc, RPCError):
        texto = str(exc).upper()
        if "NOT_FOUND" in texto or "INVALID" in texto or "EMPTY" in texto:
            return ERROR_ENTITY_NOT_FOUND, f"Telegram respondeu que o alvo não existe: {exc}"
        if "FORBIDDEN" in texto or "PRIVATE" in texto or "ADMIN_REQUIRED" in texto:
            return ERROR_PRIVATE_TOPIC, f"Acesso negado pelo Telegram: {exc}"
        return ERROR_UNKNOWN, f"Erro RPC do Telegram: {exc}"

    return ERROR_UNKNOWN, f"{type(exc).__name__}: {exc}"


class TelegramManhwaScraper:
    def __init__(self):
        self.api_id = int(os.environ.get("TELEGRAM_API_ID", 0))
        self.api_hash = os.environ.get("TELEGRAM_API_HASH", "")
        self.phone = os.environ.get("TELEGRAM_PHONE", "")
        
        if not self.api_id or not self.api_hash:
            # Não lançamos exceção no init caso o Telegram não seja usado
            pass
            
        session_name = "manhwa_session"
        self.client = TelegramClient(session_name, self.api_id, self.api_hash)

    async def connect(self):
        await self.client.start(phone=lambda: self.phone)
    
    async def disconnect(self):
        await self.client.disconnect()

    def _parse_telegram_link(self, link: str):
        # Ex: https://t.me/c/2296450302/9
        match_c = re.search(r"t\.me/c/(\d+)/(\d+)", link)
        if match_c:
            chat_id = int("-100" + match_c.group(1))
            topic_id = int(match_c.group(2))
            return chat_id, topic_id
            
        # Ex: https://t.me/GrupName/9
        match_public = re.search(r"t\.me/([^/]+)/(\d+)", link)
        if match_public:
            chat_username = match_public.group(1)
            topic_id = int(match_public.group(2))
            return chat_username, topic_id
            
        return None, None

    async def _get_topic_stats(self, topic_link: str) -> dict:
        """
        Entra em um tópico do Telegram e retorna:
        - cbz_count: quantos arquivos .cbz existem
        - avg_reactions: média de reações por capítulo
        - error_type: `None` se leu com sucesso; `EMPTY_TOPIC` se o tópico existe mas
          não tem nenhum .cbz; ou um dos `ERROR_*` se a leitura falhou
        - error_message: descrição legível quando `error_type` não é `None`

        `cbz_count = 0` sozinho é ambíguo (tópico vazio? link morto? rede caiu?), então
        o caller deve olhar `error_type` antes de gravar qualquer coisa no banco.
        """
        chat_id_or_username, topic_id = self._parse_telegram_link(topic_link)
        if not chat_id_or_username or not topic_id:
            msg = f"Link malformado: não foi possível extrair chat_id/topic_id de {topic_link!r}"
            print(f"      ⚠️  [{ERROR_INVALID_LINK}] {msg}")
            return {
                "cbz_count": 0,
                "avg_reactions": 0,
                "error_type": ERROR_INVALID_LINK,
                "error_message": msg,
            }

        try:
            if isinstance(chat_id_or_username, int):
                await self.client.get_dialogs()
            
            chat = await self.client.get_entity(chat_id_or_username)
            
            cbz_count = 0
            total_reactions = 0
            
            async for msg in self.client.iter_messages(chat, reply_to=topic_id):
                if not msg.document:
                    continue
                
                is_cbz = False
                for attr in msg.document.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        if attr.file_name.lower().endswith('.cbz'):
                            is_cbz = True
                        break
                
                if not is_cbz:
                    continue
                
                cbz_count += 1
                
                # Somar reações desta mensagem
                if msg.reactions and msg.reactions.results:
                    msg_reactions = sum(r.count for r in msg.reactions.results)
                    total_reactions += msg_reactions
            
            if cbz_count == 0:
                # Leitura funcionou (nenhuma exceção) — o tópico realmente não tem CBZ.
                # Não é erro: é um tópico vazio, e o caller não deve gravar 0 por cima
                # de um valor válido nem contabilizar isso como falha.
                msg = "Tópico lido com sucesso, mas não contém nenhum arquivo .cbz."
                print(f"      📭 [{EMPTY_TOPIC}] {msg}")
                return {
                    "cbz_count": 0,
                    "avg_reactions": 0,
                    "error_type": EMPTY_TOPIC,
                    "error_message": msg,
                }

            avg_reactions = round(total_reactions / cbz_count)
            print(f"      📊 Stats: {cbz_count} CBZs | reação média: {avg_reactions}")

            return {
                "cbz_count": cbz_count,
                "avg_reactions": avg_reactions,
                "error_type": None,
                "error_message": None,
            }
        except Exception as e:
            error_type, error_message = classify_telegram_error(e)
            categoria = "definitivo" if error_type in DEFINITIVE_ERROR_TYPES else "temporário"
            print(f"      ❌ [{error_type}/{categoria}] {error_message}")
            print(f"         Link: {topic_link}")
            return {
                "cbz_count": 0,
                "avg_reactions": 0,
                "error_type": error_type,
                "error_message": error_message,
            }

    async def download_cbz_from_topic(self, topic_link: str, manhwa_title: str, base_dir: str = None, max_concurrent: int = 5) -> dict:
        """
        Baixa todos os arquivos .cbz de um tópico do Telegram em paralelo.
        Salva em base_dir/manhwa_title/
        Pula arquivos que já existem localmente.
        Também recalcula a média de reações por capítulo no mesmo loop (sem custo extra).
        """
        import asyncio

        if base_dir is None:
            base_dir = os.environ.get("DOWNLOAD_DIR", r"D:\Manhwas")

        chat_id_or_username, topic_id = self._parse_telegram_link(topic_link)
        if not chat_id_or_username or not topic_id:
            return {"success": False, "message": "Link inválido", "downloaded": 0, "skipped": 0, "errors": 0}

        # Sanitizar nome do manhwa para usar como pasta
        safe_name = "".join(c for c in manhwa_title if c.isalnum() or c in " _-().").strip()
        if not safe_name:
            safe_name = "Manhwa_Desconhecido"
        download_dir = os.path.join(base_dir, safe_name)
        os.makedirs(download_dir, exist_ok=True)

        try:
            if isinstance(chat_id_or_username, int):
                await self.client.get_dialogs()

            chat = await self.client.get_entity(chat_id_or_username)

            # Fase 1: Coletar arquivos .cbz pendentes ou com tamanho diferente
            print(f"   🔎 Listando arquivos .cbz no tópico...")
            files_to_download = []
            skipped = 0
            replaced = 0
            cbz_count = 0
            total_reactions = 0

            async for msg in self.client.iter_messages(chat, reply_to=topic_id):
                if not msg.document:
                    continue

                file_name = None
                for attr in msg.document.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        file_name = attr.file_name
                        break

                if not file_name or not file_name.lower().endswith('.cbz'):
                    continue

                # Aproveita o loop para contabilizar reações (sem requisições adicionais)
                cbz_count += 1
                if msg.reactions and msg.reactions.results:
                    total_reactions += sum(r.count for r in msg.reactions.results)

                file_path = os.path.join(download_dir, file_name)

                if os.path.exists(file_path):
                    # Comparar tamanho local vs Telegram
                    local_size = os.path.getsize(file_path)
                    telegram_size = msg.document.size

                    if local_size == telegram_size:
                        skipped += 1
                        continue
                    else:
                        # Tamanho diferente: remover e re-baixar
                        os.remove(file_path)
                        replaced += 1
                        print(f"  ↻ [{manhwa_title}] {file_name} (local: {local_size}b ≠ telegram: {telegram_size}b)")

                files_to_download.append((msg, file_path, file_name))

            avg_reactions = round(total_reactions / cbz_count) if cbz_count > 0 else 0
            print(f"   📋 Encontrados: {len(files_to_download)} para baixar | {skipped} já existem | reação média: {avg_reactions}")

            if not files_to_download:
                return {
                    "success": True,
                    "downloaded": 0,
                    "skipped": skipped,
                    "replaced": 0,
                    "errors": 0,
                    "total": cbz_count,
                    "medium_reaction": avg_reactions,
                    "path": download_dir,
                    "message": f"Nenhum arquivo novo. {skipped} já existiam."
                }

            # Fase 2: Download paralelo com semáforo
            sem = asyncio.Semaphore(max_concurrent)
            downloaded = 0
            errors = 0

            async def _download_one(msg, file_path, file_name):
                nonlocal downloaded, errors
                async with sem:
                    try:
                        await self.client.download_media(msg, file=file_path)
                        downloaded += 1
                        print(f"  ✓ [{manhwa_title}] {file_name}")
                    except Exception as e:
                        print(f"  ✗ [{manhwa_title}] {file_name}: {e}")
                        errors += 1

            tasks = [_download_one(msg, fp, fn) for msg, fp, fn in files_to_download]
            await asyncio.gather(*tasks)

            return {
                "success": True,
                "downloaded": downloaded,
                "skipped": skipped,
                "replaced": replaced,
                "errors": errors,
                "total": cbz_count,
                "medium_reaction": avg_reactions,
                "path": download_dir,
                "message": f"{downloaded} baixados, {replaced} substituídos, {skipped} já existiam, {errors} erros."
            }
        except Exception as e:
            return {"success": False, "message": f"Erro: {str(e)}", "downloaded": 0, "skipped": 0, "errors": 0}
    
    async def scrape_manhwa_topic(self, topic_link: str, existing_titles: set = None):
        """
        Lê apenas um tópico. O nome do manhwa é o nome do tópico.
        A partir da primeira mensagem deste tópico:
        - Obtém o link da imagem (cover)
        - Obtém o link para os capítulos (no texto)
        """
        scrape_start = time.time()
        print(f"\n   🔍 Scraper: Analisando tópico {topic_link}")
        chat_id_or_username, topic_id = self._parse_telegram_link(topic_link)
        if not chat_id_or_username:
            raise ValueError("O link fornecido não parece ser um link de tópico válido.")
        
        try:
            # Para garantir que o TelegramClient conheça o chat pelo ID, listamos os dialogs primeiro
            if isinstance(chat_id_or_username, int):
                await self.client.get_dialogs()
                
            chat = await self.client.get_entity(chat_id_or_username)
            title = "Manhwa Desconhecido"
            
            try:
                topics_result = await self.client(GetForumTopicsByIDRequest(
                    channel=chat,
                    topics=[topic_id]
                ))
                if topics_result.topics:
                    title = topics_result.topics[0].title
                    print(f"   📌 Tópico: {title}")
            except Exception:
                pass
            
            # Buscar as mensagens do tópico (reply_to=topic_id)
            print(f"   📨 Buscando mensagens do tópico...")
            msgs = await self.client.get_messages(chat, reply_to=topic_id, min_id=1741, limit=None, reverse=True)
            if not msgs:
                msgs_raw = await self.client.get_messages(chat, min_id=1741, limit=None)
                msgs = [m for m in msgs_raw if m]
            
            print(f"   📨 Total de mensagens: {len(msgs)}")
            manhwas_encontrados = []
            msg_com_foto = 0
            
            for msg in msgs:
                # O usuário pediu para só pegar as que têm foto
                if not getattr(msg, 'photo', None):
                    continue
                msg_com_foto += 1
                
                text = msg.text or ""
                # O título geralmente é a primeira linha
                linhas = [linha.strip() for linha in text.split('\n') if linha.strip()]
                
                # Se a primeira linha for apenas o número de indexação (ex: "Nº 20" ou "20"), pegamos a próxima linha
                msg_title = f"Manhwa {msg.id}"
                if linhas:
                    if re.match(r'^(n[oº°]?\s*\d+|#\s*\d+|\d+)$', linhas[0], re.IGNORECASE) and len(linhas) > 1:
                        msg_title = linhas[1]
                    else:
                        msg_title = linhas[0]
                
                raw_title = msg_title

                # Limpar título: remover sufixos como "Finalizado", "Em Andamento", etc.
                _status_words = r'(finalizado|em andamento|completo|hiato|dropped)'
                msg_title = re.sub(rf'\s*[-–—|/]\s*{_status_words}\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = re.sub(rf'\s*[\(\[]{_status_words}[\)\]]\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = re.sub(rf'\s+{_status_words}\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = msg_title.strip()
                
                if existing_titles and msg_title.lower() in existing_titles:
                    manhwas_encontrados.append({
                        "title": msg_title,
                        "skipped_because_exists": True
                    })
                    continue
                
                # Extraindo URLs — primeiro tenta via entities do Telegram (mais confiável)
                chapter_link = ""
                if hasattr(msg, 'entities') and msg.entities:
                    for entity in msg.entities:
                        if hasattr(entity, 'url') and entity.url:
                            chapter_link = entity.url
                            break
                
                # Fallback: buscar URLs no texto puro
                if not chapter_link:
                    links = re.findall(r'(https?://\S+)', text)
                    if links:
                        # Remover pontuação final que pode ter sido capturada
                        chapter_link = links[0].rstrip('.,;:)>]"\'')
                    
                # Garantir que a pasta no frontend existe
                frontend_covers_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "covers")
                os.makedirs(frontend_covers_dir, exist_ok=True)
                
                safe_title = "".join(c for c in msg_title if c.isalnum() or c in " _-").strip()
                file_name = f"cover_{safe_title}_{msg.id}.jpg".replace(" ", "_")
                full_path = os.path.join(frontend_covers_dir, file_name)
                
                if not os.path.exists(full_path):
                    await msg.download_media(file=full_path)
                    
                cover_url = f"/covers/{file_name}"
                
                # Obter stats do tópico de capítulos (contagem + média de reações)
                total_chapters = 0
                medium_reaction = 0
                if chapter_link and 't.me' in chapter_link:
                    print(f"      🔗 Buscando stats de: {msg_title}...")
                    stats = await self._get_topic_stats(chapter_link)
                    total_chapters = stats["cbz_count"]
                    medium_reaction = stats["avg_reactions"]
                
                manhwas_encontrados.append({
                    "title": msg_title,
                    "raw_title": raw_title,
                    "notes": chapter_link,
                    "cover_url": cover_url,
                    "total_chapters": total_chapters,
                    "medium_reaction": medium_reaction
                })
                
            elapsed = time.time() - scrape_start
            print(f"   ✅ Scraper concluído: {len(manhwas_encontrados)} manhwas ({msg_com_foto} msgs com foto) em {elapsed:.1f}s")
            return manhwas_encontrados
                    
        except Exception as e:
            print(f"   ❌ Scraper erro: {str(e)}")
            raise ValueError(f"Não foi possível buscar o manhwa: {str(e)}")
