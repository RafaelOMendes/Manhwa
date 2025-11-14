"""
Script de teste rápido para importar manhwas do Telegram
"""
import asyncio
import sys
import os

# Adicionar o diretório atual ao path
sys.path.insert(0, os.path.dirname(__file__))

from telegram_scraper import TelegramManhwaScraper


async def quick_import():
    """Teste rápido de importação"""
    
    print("=" * 60)
    print("🚀 TESTE DE IMPORTAÇÃO DO TELEGRAM")
    print("=" * 60)
    print()
    
    # Verificar configuração
    from dotenv import load_dotenv
    load_dotenv()
    
    api_id = os.getenv('TELEGRAM_API_ID')
    api_hash = os.getenv('TELEGRAM_API_HASH')
    phone = os.getenv('TELEGRAM_PHONE')
    
    print("📋 Verificando configuração...")
    if not all([api_id, api_hash, phone]):
        print("❌ ERRO: Configuração incompleta!")
        print()
        print("Configure o arquivo .env com:")
        print("  - TELEGRAM_API_ID")
        print("  - TELEGRAM_API_HASH")
        print("  - TELEGRAM_PHONE")
        print()
        print("Veja o arquivo TELEGRAM_SETUP.md para instruções detalhadas.")
        return
    
    print("✅ Configuração OK!")
    print()
    
    # Configuração do canal
    channel_link = "https://t.me/c/2296450302/9"
    limit = 30  # Buscar últimas 30 mensagens
    
    print(f"📱 Canal: {channel_link}")
    print(f"📊 Limite: {limit} mensagens")
    print()
    
    scraper = TelegramManhwaScraper()
    
    try:
        print("🔐 Conectando ao Telegram...")
        print("   (Na primeira vez, você receberá um código no Telegram)")
        await scraper.connect()
        print("✅ Conectado!")
        print()
        
        print("🔍 Buscando manhwas...")
        manhwas = await scraper.scrape_manhwas(channel_link, limit)
        
        print(f"✅ Encontrados {len(manhwas)} manhwas!")
        print()
        print("=" * 60)
        print("📚 MANHWAS ENCONTRADOS:")
        print("=" * 60)
        
        for i, manhwa in enumerate(manhwas, 1):
            print(f"\n{i}. 📖 {manhwa['title']}")
            if manhwa.get('current_chapter'):
                print(f"   📄 Capítulo: {manhwa['current_chapter']}")
            if manhwa.get('cover_url'):
                print(f"   🖼️  Capa: {manhwa['cover_url']}")
            if manhwa.get('notes'):
                notes = manhwa['notes'][:100]
                print(f"   📝 Notas: {notes}{'...' if len(manhwa['notes']) > 100 else ''}")
        
        print()
        print("=" * 60)
        print("✨ IMPORTAÇÃO CONCLUÍDA!")
        print("=" * 60)
        print()
        print("💡 Para importar para o banco de dados, use:")
        print("   POST http://localhost:8000/api/telegram/import")
        
    except Exception as e:
        print(f"❌ ERRO: {e}")
        print()
        import traceback
        traceback.print_exc()
        
    finally:
        print()
        print("🔌 Desconectando...")
        await scraper.disconnect()
        print("✅ Desconectado!")


if __name__ == "__main__":
    print()
    asyncio.run(quick_import())
    print()
