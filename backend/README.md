# Manhwa Tracker Backend

API backend para o Manhwa Tracker, construída com FastAPI e PostgreSQL.

## 📑 Índice

- [Instalação Rápida](#instalação-rápida)
- [Configuração do PostgreSQL](#configuração-do-postgresql)
- [Integração com Telegram](#integração-com-telegram)
- [Endpoints da API](#endpoints-da-api)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Tecnologias](#tecnologias)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Instalação Rápida

### Pré-requisitos

1. PostgreSQL instalado (versão 12 ou superior)
2. Python 3.8 ou superior com pip

### Passo a Passo

#### 1️⃣ Instalar PostgreSQL

**Windows:**
1. Baixe em: https://www.postgresql.org/download/windows/
2. Execute o instalador
3. Anote a senha que você criar para o usuário `postgres`
4. Mantenha a porta padrão: `5432`

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

#### 2️⃣ Criar o Banco de Dados

Abra o SQL Shell (psql) e execute:

```sql
CREATE DATABASE manhwa_tracker;
\q
```

**⚠️ IMPORTANTE - Corrigir Permissões:**

Se você receber erro de "permissão negada", execute no psql:

```sql
-- Conectar ao banco
\c manhwa_tracker

-- Dar permissões ao usuário postgres
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Definir como owner
ALTER DATABASE manhwa_tracker OWNER TO postgres;
```

#### 3️⃣ Configurar o Projeto

**a) Clonar/Navegar para o projeto:**
```powershell
cd backend
```

**b) Criar ambiente virtual:**
```bash
python -m venv venv
```

**c) Ativar ambiente virtual:**
- Windows: `.\venv\Scripts\activate`
- Linux/Mac: `source venv/bin/activate`

**d) Instalar dependências:**
```bash
pip install -r requirements.txt
```

**e) Configurar variáveis de ambiente:**

Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

Edite o arquivo `.env`:
```env
# PostgreSQL (OBRIGATÓRIO)
DATABASE_URL=postgresql+asyncpg://postgres:SUA_SENHA@localhost:5432/manhwa_tracker

# Telegram (Opcional - apenas para importação)
TELEGRAM_API_ID=seu_api_id
TELEGRAM_API_HASH=seu_api_hash
TELEGRAM_PHONE=+5511999999999
```

#### 4️⃣ Inicializar o Banco de Dados

```bash
# Usando o Python do ambiente virtual
.\venv\Scripts\python.exe init_db.py
```

Você deve ver:
```
✓ Conexão com PostgreSQL estabelecida!
✓ Tabelas criadas com sucesso!
```

#### 5️⃣ Iniciar a Aplicação

```bash
.\venv\Scripts\python.exe main.py
```

Ou com uvicorn:
```bash
uvicorn main:app --reload
```

A API estará disponível em `http://localhost:8000`

Documentação interativa: `http://localhost:8000/docs`

## 🆕 Integração com Telegram

Este projeto agora suporta importação automática de manhwas de canais do Telegram!

### Setup Rápido

1. **Configure as credenciais do Telegram:**
   - Copie `.env.example` para `.env`
   - Obtenha suas credenciais em https://my.telegram.org/apps
   - Preencha `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` e `TELEGRAM_PHONE`

2. **Teste a integração:**
   ```bash
   python test_telegram_import.py
   ```

3. **Use via API:**
   ```bash
   POST /api/telegram/import
   ```

📖 **Documentação completa:** Veja [TELEGRAM_SETUP.md](TELEGRAM_SETUP.md) para instruções detalhadas.

## Endpoints da API

### Manhwas
- `GET /api/manhwas` - Lista todos os manhwas
- `GET /api/manhwas/{id}` - Busca um manhwa específico
- `POST /api/manhwas` - Cria um novo manhwa
- `PUT /api/manhwas/{id}` - Atualiza um manhwa
- `DELETE /api/manhwas/{id}` - Deleta um manhwa

### Telegram (Novo! 🎉)
- `GET /api/telegram/test` - Testa configuração do Telegram
- `POST /api/telegram/import` - Importa manhwas de um canal


