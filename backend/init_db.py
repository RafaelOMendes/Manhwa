# -*- coding: utf-8 -*-
"""
Script para inicializar o banco de dados PostgreSQL
Cria todas as tabelas necessárias para o Manhwa Tracker
"""
import asyncio
from database import create_tables, drop_tables, engine
from sqlalchemy import text


async def check_database_connection():
    """Verifica se a conexão com o banco de dados está funcionando"""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version();"))
            version = result.scalar()
            print(f"✓ Conexão com PostgreSQL estabelecida!")
            print(f"  Versão: {version}")
            return True
    except Exception as e:
        print(f"✗ Erro ao conectar ao banco de dados:")
        print(f"  {str(e)}")
        return False


async def initialize_database(reset: bool = False):
    """
    Inicializa o banco de dados
    
    Args:
        reset: Se True, remove todas as tabelas antes de criar novamente
    """
    print("\n=== Inicialização do Banco de Dados ===\n")
    
    # Verificar conexão
    if not await check_database_connection():
        print("\nVerifique:")
        print("1. O PostgreSQL está rodando?")
        print("2. O banco de dados foi criado?")
        print("3. As credenciais no arquivo .env estão corretas?")
        return False
    
    try:
        if reset:
            print("\n⚠ Modo RESET ativado - Removendo tabelas existentes...")
            await drop_tables()
            print("✓ Tabelas removidas")
        
        print("\nCriando tabelas...")
        await create_tables()
        print("✓ Tabelas criadas com sucesso!")
        
        # Listar tabelas criadas
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename;
            """))
            tables = result.fetchall()
            
            if tables:
                print("\nTabelas no banco de dados:")
                for (table_name,) in tables:
                    print(f"  - {table_name}")
            
        print("\n✓ Banco de dados inicializado com sucesso!")
        return True
        
    except Exception as e:
        print(f"\n✗ Erro ao inicializar banco de dados:")
        print(f"  {str(e)}")
        return False
    finally:
        await engine.dispose()


async def main():
    """Função principal"""
    import sys
    
    # Verificar se foi solicitado reset
    reset = "--reset" in sys.argv or "-r" in sys.argv
    
    if reset:
        confirm = input("\n⚠ ATENÇÃO: Isto irá APAGAR TODOS OS DADOS. Continuar? (sim/não): ")
        if confirm.lower() != "sim":
            print("Operação cancelada.")
            return
    
    success = await initialize_database(reset=reset)
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    print("Manhwa Tracker - Inicialização do Banco de Dados")
    asyncio.run(main())
