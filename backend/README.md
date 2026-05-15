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
.\venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 6️⃣ Testar

Acesse: http://localhost:8000/docs

---

## 🐘 Configuração do PostgreSQL

### Estrutura do Banco de Dados

#### Tabela: manhwas

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | INTEGER | Chave primária (auto-incremento) |
| title | VARCHAR(255) | Título do manhwa |
| cover_url | TEXT | URL da capa (opcional) |
| status | VARCHAR(50) | Status: reading, completed, plan_to_read |
| current_chapter | INTEGER | Capítulo atual (padrão: 0) |
| total_chapters | INTEGER | Total de capítulos (opcional) |
| rating | INTEGER | Avaliação de 1 a 5 (opcional) |
| notes | TEXT | Notas pessoais (opcional) |
| created_at | TIMESTAMP | Data de criação (automático) |
| updated_at | TIMESTAMP | Data de atualização (automático) |
| is_reading | BOOLEAN | Estou lendo ainda |
| andamento | CHARACTER VARYING | andamento |

### Comandos Úteis do PostgreSQL

```sql
-- Ver bancos de dados
\l

-- Conectar a um banco
\c manhwa_tracker

-- Listar tabelas
\dt

-- Ver estrutura de uma tabela
\d manhwas

-- Ver dados de uma tabela
SELECT * FROM manhwas;

-- Limpar todos os dados de uma tabela
TRUNCATE manhwas;
```

### Backup e Restore

**Fazer backup:**
```bash
pg_dump -U postgres manhwa_tracker > backup.sql
```

**Restaurar backup:**
```bash
psql -U postgres manhwa_tracker < backup.sql
```

### Migração de Dados do JSON

Se você tinha dados no arquivo `manhwas.json`:

```bash
.\venv\Scripts\python.exe migrate_json_to_db.py
```

---

## 📱 Integração com Telegram

### 🔑 Obter Credenciais do Telegram

1. Acesse: https://my.telegram.org/apps
2. Faça login com seu número de telefone
3. Clique em "API development tools"
4. Preencha o formulário:
   - **App title**: Manhwa Tracker
   - **Short name**: manhwa_tracker
   - **Platform**: Desktop
5. Clique em "Create application"
6. Guarde os valores de **api_id** e **api_hash**

### ⚙️ Configurar Telegram

Edite o arquivo `.env`:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abc123def456...
TELEGRAM_PHONE=+5511999999999
TELEGRAM_SESSION_NAME=manhwa_session
```

### 🚀 Testar Integração

**Via script:**
```bash
.\venv\Scripts\python.exe test_telegram_import.py
```

**Via API:**
```bash
# Testar configuração
curl http://localhost:8000/api/telegram/test

# Importar manhwas
curl -X POST "http://localhost:8000/api/telegram/import" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_link": "https://t.me/seu_canal",
    "limit": 50,
    "auto_status": "plan_to_read"
  }'
```

### 📝 Como Funciona

1. **Conexão**: O scraper conecta ao Telegram usando suas credenciais
2. **Busca**: Busca as últimas mensagens do canal especificado
3. **Extração**: Analisa mensagens procurando por títulos e capítulos
4. **Importação**: Adiciona os manhwas ao banco de dados
5. **Evita duplicatas**: Verifica títulos existentes antes de adicionar

---

## 📚 Endpoints da API

### Manhwas

**`GET /api/manhwas`**
- Lista todos os manhwas
- Query params: `?status=reading` (opcional)

**`GET /api/manhwas/{id}`**
- Busca um manhwa específico

**`POST /api/manhwas`**
- Cria um novo manhwa
- Body:
```json
{
  "title": "Nome do Manhwa",
  "status": "plan_to_read",
  "current_chapter": 0
}
```

**`PUT /api/manhwas/{id}`**
- Atualiza um manhwa existente

**`DELETE /api/manhwas/{id}`**
- Deleta um manhwa

### Telegram

**`GET /api/telegram/test`**
- Testa configuração do Telegram
- Resposta:
```json
{
  "configured": true,
  "config": {
    "api_id": "✓ Configurado",
    "api_hash": "✓ Configurado",
    "phone": "✓ Configurado"
  }
}
```

**`POST /api/telegram/import`**
- Importa manhwas de um canal
- Body:
```json
{
  "channel_link": "https://t.me/c/2296450302/9",
  "limit": 50,
  "auto_status": "plan_to_read"
}
```
- Resposta:
```json
{
  "success": true,
  "imported": 10,
  "skipped": 5,
  "total_found": 15,
  "message": "Importados 10 manhwas, 5 já existiam"
}
```

---

## 🏗️ Estrutura do Projeto

```
backend/
├── main.py                    # Aplicação FastAPI principal
├── database.py                # Configuração do PostgreSQL
├── models.py                  # Modelos SQLAlchemy
├── init_db.py                 # Script de inicialização do banco
├── migrate_json_to_db.py      # Script de migração JSON → PostgreSQL
├── telegram_scraper.py        # Scraper do Telegram
├── test_telegram_import.py    # Script de teste do Telegram
├── requirements.txt           # Dependências Python
├── .env.example              # Exemplo de variáveis de ambiente
├── .env                      # Configurações (NÃO VERSIONAR)
└── README.md                 # Este arquivo
```

---

## 🛠️ Tecnologias

- **FastAPI** - Framework web assíncrono
- **PostgreSQL** - Banco de dados relacional
- **SQLAlchemy 2.0** - ORM Python
- **asyncpg** - Driver assíncrono do PostgreSQL
- **Pydantic** - Validação de dados
- **Telethon** - Cliente do Telegram (opcional)
- **Uvicorn** - Servidor ASGI

---

## 🔧 Troubleshooting

### Erro: "could not connect to server"
- Verifique se o PostgreSQL está rodando
- Windows: `Services` → PostgreSQL deve estar "Running"
- Linux: `sudo systemctl status postgresql`

### Erro: "password authentication failed"
- Verifique se a senha no `.env` está correta
- A senha é a mesma que você criou ao instalar o PostgreSQL

### Erro: "database does not exist"
- Execute: `CREATE DATABASE manhwa_tracker;` no psql
- Verifique se o nome do banco no `.env` está correto

### Erro: "permissão negada para esquema public"
Execute no psql:
```sql
\c manhwa_tracker
GRANT ALL ON SCHEMA public TO postgres;
ALTER DATABASE manhwa_tracker OWNER TO postgres;
```

### Erro: "No module named 'asyncpg'"
```bash
# Certifique-se de usar o Python do venv
.\venv\Scripts\python.exe -m pip install asyncpg psycopg2-binary
```

### Erro ao importar do Telegram
- Verifique se o `.env` está configurado corretamente
- Na primeira vez, você receberá um código no Telegram
- Digite o código no terminal quando solicitado
- Um arquivo `.session` será criado para sessões futuras

### API não está aceitando conexões
- Verifique se usou `.\venv\Scripts\python.exe main.py`
- Certifique-se de que a porta 8000 está livre
- Use `--host 0.0.0.0` para aceitar conexões externas

---

## 🔒 Segurança

- **Nunca compartilhe** seu `API_ID`, `API_HASH` ou senha do banco
- Adicione `.env` ao `.gitignore` (já configurado)
- Mantenha o arquivo `.session` seguro
- Em produção, use variáveis de ambiente do sistema
- Desative o modo `echo=True` do SQLAlchemy em produção

---

## 📝 Notas Importantes

1. **Banco de Dados:** Este projeto usa PostgreSQL. O arquivo `manhwas.json` não é mais utilizado.
2. **Backup:** Faça backups regulares usando `pg_dump`
3. **Produção:** Em produção, use variáveis de ambiente seguras e desative o modo debug
4. **Migrations:** Para mudanças no schema, considere usar Alembic
5. **Python:** Use sempre `.\venv\Scripts\python.exe` para garantir que está usando o ambiente virtual

---

## 📚 Recursos Adicionais

- [Documentação FastAPI](https://fastapi.tiangolo.com/)
- [Documentação PostgreSQL](https://www.postgresql.org/docs/)
- [Documentação SQLAlchemy](https://docs.sqlalchemy.org/)
- [Documentação Telethon](https://docs.telethon.dev/)
- [API do Telegram](https://core.telegram.org/api)

---

## 🎯 Checklist de Instalação

- [ ] PostgreSQL instalado
- [ ] Banco de dados `manhwa_tracker` criado
- [ ] Permissões do banco configuradas
- [ ] Ambiente virtual Python criado
- [ ] Dependências instaladas (`pip install -r requirements.txt`)
- [ ] Arquivo `.env` configurado
- [ ] Banco inicializado (`python init_db.py`)
- [ ] API rodando (`python main.py`)
- [ ] Documentação acessível (http://localhost:8000/docs)
- [ ] (Opcional) Telegram configurado e testado

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT.

---

**✨ Desenvolvido com FastAPI e PostgreSQL**
