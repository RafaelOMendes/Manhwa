# -*- coding: utf-8 -*-
"""
Script para migrar dados do arquivo JSON para o banco PostgreSQL
"""
import asyncio
import json
import os
from database import async_session_maker, create_tables
from models import Manhwa


async def migrate_json_to_postgres(json_file: str = "manhwas.json"):
    """
    Migra dados do arquivo JSON para o PostgreSQL
    
    Args:
        json_file: Caminho para o arquivo JSON com os dados
    """
    print("\n=== Migração de Dados JSON → PostgreSQL ===\n")
    
    # Verificar se o arquivo existe
    if not os.path.exists(json_file):
        print(f"✗ Arquivo '{json_file}' não encontrado!")
        print("  Nenhum dado para migrar.")
        return
    
    # Ler dados do JSON
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not data:
            print("✓ Arquivo JSON está vazio. Nenhum dado para migrar.")
            return
        
        print(f"✓ {len(data)} manhwas encontrados no arquivo JSON")
        
    except Exception as e:
        print(f"✗ Erro ao ler arquivo JSON: {str(e)}")
        return
    
    # Garantir que as tabelas existem
    print("\nVerificando tabelas no banco de dados...")
    await create_tables()
    print("✓ Tabelas OK")
    
    # Migrar dados
    print("\nMigrando dados...")
    migrated = 0
    skipped = 0
    errors = []
    
    async with async_session_maker() as session:
        try:
            for item in data:
                try:
                    # Verificar se já existe (por título)
                    from sqlalchemy import select
                    result = await session.execute(
                        select(Manhwa).where(Manhwa.title == item['title'])
                    )
                    existing = result.scalar_one_or_none()
                    
                    if existing:
                        print(f"  ⊝ Pulando '{item['title']}' (já existe)")
                        skipped += 1
                        continue
                    
                    # Criar novo manhwa
                    manhwa = Manhwa(
                        title=item['title'],
                        author=item.get('author'),
                        cover_url=item.get('cover_url'),
                        status=item.get('status', 'plan_to_read'),
                        current_chapter=item.get('current_chapter', 0),
                        total_chapters=item.get('total_chapters'),
                        rating=item.get('rating'),
                        notes=item.get('notes'),
                    )
                    
                    session.add(manhwa)
                    migrated += 1
                    print(f"  ✓ Migrado: '{item['title']}'")
                    
                except Exception as e:
                    error_msg = f"Erro ao migrar '{item.get('title', 'unknown')}': {str(e)}"
                    errors.append(error_msg)
                    print(f"  ✗ {error_msg}")
            
            # Commit das mudanças
            await session.commit()
            
        except Exception as e:
            await session.rollback()
            print(f"\n✗ Erro durante a migração: {str(e)}")
            return
    
    # Relatório final
    print("\n=== Relatório de Migração ===")
    print(f"Total no JSON: {len(data)}")
    print(f"Migrados: {migrated}")
    print(f"Pulados (já existiam): {skipped}")
    print(f"Erros: {len(errors)}")
    
    if errors:
        print("\nErros encontrados:")
        for error in errors:
            print(f"  - {error}")
    
    if migrated > 0:
        print(f"\n✓ Migração concluída com sucesso!")
        print(f"\nVocê pode fazer backup do arquivo JSON e depois removê-lo:")
        print(f"  mv {json_file} {json_file}.backup")
    else:
        print("\n⊝ Nenhum dado novo foi migrado.")


async def main():
    """Função principal"""
    import sys
    
    json_file = "manhwas.json"
    
    # Verificar se foi passado um arquivo diferente
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    
    await migrate_json_to_postgres(json_file)


if __name__ == "__main__":
    print("Manhwa Tracker - Migração de Dados JSON para PostgreSQL")
    asyncio.run(main())
