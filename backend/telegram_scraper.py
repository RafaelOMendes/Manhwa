"""
Telegram Scraper para extrair informações de manhwas do canal do Telegram
"""
import os
import re
from typing import List, Dict, Optional
from telethon import TelegramClient
from telethon.tl.types import Message
from dotenv import load_dotenv
import asyncio

load_dotenv()

# Configurações do Telegram
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
PHONE = os.getenv('TELEGRAM_PHONE')
SESSION_NAME = os.getenv('TELEGRAM_SESSION_NAME', 'manhwa_session')

class TelegramManhwaScraper:
    def __init__(self):
        self.client = None
        
    async def connect(self):
        """Conecta ao Telegram"""
        if not API_ID or not API_HASH:
            raise ValueError("TELEGRAM_API_ID e TELEGRAM_API_HASH devem estar configurados no .env")
        
        self.client = TelegramClient(SESSION_NAME, int(API_ID), API_HASH)
        await self.client.start(phone=PHONE)
        print("Conectado ao Telegram!")
        
    async def disconnect(self):
        """Desconecta do Telegram"""
        if self.client:
            await self.client.disconnect()
            
    async def get_channel_messages(self, channel_link: str, limit: int = 100) -> List[Message]:
        """
        Busca mensagens de um canal do Telegram
        
        Args:
            channel_link: Link do canal (ex: https://t.me/c/2296450302/9)
            limit: Número máximo de mensagens para buscar
        """
        if not self.client:
            await self.connect()
        
        try:
            # Extrair ID do canal do link
            # Formato: https://t.me/c/CHANNEL_ID/MESSAGE_ID
            match = re.search(r'/c/(\d+)', channel_link)
            if match:
                channel_id = int(match.group(1))
                # Converter para formato correto (adicionar -100 no início)
                channel_id = int(f"-100{channel_id}")
            else:
                # Se for um link público, usar diretamente
                channel_id = channel_link
            
            messages = []
            async for message in self.client.iter_messages(channel_id, limit=limit):
                messages.append(message)
            
            return messages
        except Exception as e:
            print(f"Erro ao buscar mensagens: {e}")
            raise
            
    def extract_manhwa_info(self, message: Message) -> Optional[Dict]:
        """
        Extrai informações de manhwa de uma mensagem
        
        Procura por padrões comuns em posts de manhwa:
        - Título
        - Capítulo atual
        - Status
        - Link de imagem
        """
        if not message.text and not message.message:
            return None
            
        text = message.text or message.message or ""
        
        # Padrões para extrair informações
        manhwa_info = {
            "title": None,
            "current_chapter": None,
            "cover_url": None,
            "notes": text[:500] if text else None,  # Primeiros 500 caracteres como notas
        }
        
        # Tentar extrair título (geralmente está em negrito ou na primeira linha)
        lines = text.split('\n')
        if lines:
            # Primeira linha não vazia geralmente é o título
            for line in lines:
                if line.strip():
                    manhwa_info["title"] = line.strip()
                    break
        
        # Tentar extrair número do capítulo
        chapter_patterns = [
            r'cap[íi]tulo\s*(\d+)',
            r'chapter\s*(\d+)',
            r'cap\s*(\d+)',
            r'ch\s*(\d+)',
            r'#(\d+)',
        ]
        
        for pattern in chapter_patterns:
            match = re.search(pattern, text.lower())
            if match:
                manhwa_info["current_chapter"] = int(match.group(1))
                break
        
        # Extrair imagem se houver
        if message.photo:
            manhwa_info["cover_url"] = f"telegram_photo_{message.id}"
        elif message.document and message.document.mime_type and 'image' in message.document.mime_type:
            manhwa_info["cover_url"] = f"telegram_document_{message.id}"
            
        # Se não encontrou título, usar "Manhwa do canal"
        if not manhwa_info["title"]:
            if manhwa_info["current_chapter"]:
                manhwa_info["title"] = f"Manhwa - Cap. {manhwa_info['current_chapter']}"
            else:
                return None  # Ignorar mensagens sem título identificável
                
        return manhwa_info
        
    async def scrape_manhwas(self, channel_link: str, limit: int = 100) -> List[Dict]:
        """
        Scrape manhwas do canal do Telegram
        
        Args:
            channel_link: Link do canal
            limit: Número máximo de mensagens para processar
            
        Returns:
            Lista de dicionários com informações dos manhwas
        """
        messages = await self.get_channel_messages(channel_link, limit)
        manhwas = []
        
        for message in messages:
            manhwa_info = self.extract_manhwa_info(message)
            if manhwa_info:
                manhwas.append(manhwa_info)
        
        return manhwas
    
    async def download_photo(self, message: Message, path: str = "covers/") -> Optional[str]:
        """
        Baixa foto de uma mensagem
        
        Args:
            message: Mensagem contendo a foto
            path: Diretório onde salvar
            
        Returns:
            Caminho do arquivo salvo
        """
        os.makedirs(path, exist_ok=True)
        
        if message.photo:
            file_path = os.path.join(path, f"cover_{message.id}.jpg")
            await message.download_media(file_path)
            return file_path
            
        return None


async def main():
    """Exemplo de uso"""
    scraper = TelegramManhwaScraper()
    
    try:
        await scraper.connect()
        
        # Link do canal
        channel_link = "https://t.me/c/2296450302/9"
        
        print("Buscando manhwas do canal...")
        manhwas = await scraper.scrape_manhwas(channel_link, limit=50)
        
        print(f"\nEncontrados {len(manhwas)} manhwas:")
        for i, manhwa in enumerate(manhwas, 1):
            print(f"\n{i}. {manhwa['title']}")
            if manhwa.get('current_chapter'):
                print(f"   Capítulo: {manhwa['current_chapter']}")
            if manhwa.get('notes'):
                print(f"   Notas: {manhwa['notes'][:100]}...")
                
    finally:
        await scraper.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
