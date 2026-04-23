import asyncio
from sqlalchemy import text
from database import engine

async def alter_db():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE manhwas ADD COLUMN andamento VARCHAR(50) DEFAULT 'andamento'"))
            print("Coluna 'andamento' criada com sucesso na tabela manhwas!")
        except Exception as e:
            print("A coluna provavelemente já existe ou ocorreu um erro:", e)

if __name__ == "__main__":
    asyncio.run(alter_db())
