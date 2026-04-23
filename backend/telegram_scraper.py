import os
import re
import html
from telethon import TelegramClient
from telethon.tl.types import MessageService, MessageActionTopicCreate, Message, DocumentAttributeFilename
from telethon.tl.functions.channels import GetForumTopicsByIDRequest

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

    async def _count_cbz_in_topic(self, topic_link: str) -> int:
        """
        Entra em um tópico do Telegram e conta quantos arquivos .cbz existem.
        Cada arquivo .cbz representa um capítulo.
        """
        chat_id_or_username, topic_id = self._parse_telegram_link(topic_link)
        if not chat_id_or_username or not topic_id:
            return 0
        
        try:
            if isinstance(chat_id_or_username, int):
                await self.client.get_dialogs()
            
            chat = await self.client.get_entity(chat_id_or_username)
            
            cbz_count = 0
            async for msg in self.client.iter_messages(chat, reply_to=topic_id):
                if not msg.document:
                    continue
                for attr in msg.document.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        if attr.file_name.lower().endswith('.cbz'):
                            cbz_count += 1
                        break
            
            return cbz_count
        except Exception as e:
            print(f"Erro ao contar .cbz no tópico {topic_link}: {e}")
            return 0
    
    async def scrape_manhwa_topic(self, topic_link: str, limit: int = 50):
        """
        Lê apenas um tópico. O nome do manhwa é o nome do tópico.
        A partir da primeira mensagem deste tópico:
        - Obtém o link da imagem (cover)
        - Obtém o link para os capítulos (no texto)
        """
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
                # Buscando infos do tópico pelo ID
                topics_result = await self.client(GetForumTopicsByIDRequest(
                    channel=chat,
                    topics=[topic_id]
                ))
                if topics_result.topics:
                    title = topics_result.topics[0].title
            except Exception:
                pass
            
            # Buscar as mensagens do tópico (reply_to=topic_id)
            msgs = await self.client.get_messages(chat, reply_to=topic_id, min_id=1741, limit=limit, reverse=True)
            if not msgs:
                # Fallback caso a reverse fetch falhe
                msgs_raw = await self.client.get_messages(chat, min_id=1741, limit=limit)
                msgs = [m for m in msgs_raw if m]
            
            manhwas_encontrados = []
            
            for msg in msgs:
                # O usuário pediu para só pegar as que têm foto
                if not getattr(msg, 'photo', None):
                    continue
                
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
                
                # Limpar título: remover sufixos como "Finalizado", "Em Andamento", etc.
                _status_words = r'(finalizado|em andamento|completo|hiato|dropped)'
                msg_title = re.sub(rf'\s*[-–—|/]\s*{_status_words}\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = re.sub(rf'\s*[\(\[]{_status_words}[\)\]]\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = re.sub(rf'\s+{_status_words}\s*$', '', msg_title, flags=re.IGNORECASE)
                msg_title = msg_title.strip()
                
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
                
                # Contar arquivos .cbz no tópico de capítulos
                total_chapters = 0
                if chapter_link and 't.me' in chapter_link:
                    total_chapters = await self._count_cbz_in_topic(chapter_link)
                
                manhwas_encontrados.append({
                    "title": msg_title,
                    "notes": chapter_link,
                    "cover_url": cover_url,
                    "total_chapters": total_chapters
                })
                
            return manhwas_encontrados
                    
        except Exception as e:
            raise ValueError(f"Não foi possível buscar o manhwa: {str(e)}")
