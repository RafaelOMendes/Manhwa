# Integração com Telegram - Guia de Configuração

## 📋 Pré-requisitos

Para usar a integração com o Telegram, você precisa:

1. **Conta do Telegram** com número de telefone
2. **API ID e API Hash** do Telegram

## 🔑 Passo 1: Obter Credenciais do Telegram

1. Acesse: https://my.telegram.org/apps
2. Faça login com seu número de telefone
3. Clique em "API development tools"
4. Preencha o formulário:
   - **App title**: Manhwa Tracker (ou qualquer nome)
   - **Short name**: manhwa_tracker
   - **Platform**: Desktop
   - **Description**: Aplicativo para rastrear manhwas
5. Clique em "Create application"
6. Guarde os valores de:
   - **api_id** (número)
   - **api_hash** (string alfanumérica)

## ⚙️ Passo 2: Configurar o Projeto

1. **Instalar dependências:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Criar arquivo .env:**
   
   Copie o arquivo `.env.example` para `.env`:
   ```bash
   copy .env.example .env
   ```

3. **Editar arquivo .env:**
   
   Abra o arquivo `.env` e preencha com suas credenciais:
   ```env
   TELEGRAM_API_ID=12345678
   TELEGRAM_API_HASH=abc123def456...
   TELEGRAM_PHONE=+5511999999999
   TELEGRAM_SESSION_NAME=manhwa_session
   ```

   **Importante:**
   - `TELEGRAM_API_ID`: Número obtido no passo 1
   - `TELEGRAM_API_HASH`: String alfanumérica obtida no passo 1
   - `TELEGRAM_PHONE`: Seu número com código do país (ex: +55 para Brasil)
   - `TELEGRAM_SESSION_NAME`: Nome da sessão (pode deixar como está)

## 🚀 Passo 3: Testar a Configuração

1. **Testar scraper diretamente:**
   ```bash
   python telegram_scraper.py
   ```
   
   Na primeira vez, você receberá um código no Telegram. Digite-o no terminal.

2. **Testar via API:**
   
   Inicie o servidor:
   ```bash
   python main.py
   ```
   
   Teste a configuração:
   ```bash
   curl http://localhost:8000/api/telegram/test
   ```

## 📥 Passo 4: Importar Manhwas

### Via API (cURL):

```bash
curl -X POST "http://localhost:8000/api/telegram/import" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_link": "https://t.me/c/2296450302/9",
    "limit": 50,
    "auto_status": "plan_to_read"
  }'
```

### Via Python:

```python
import requests

response = requests.post(
    "http://localhost:8000/api/telegram/import",
    json={
        "channel_link": "https://t.me/c/2296450302/9",
        "limit": 50,
        "auto_status": "plan_to_read"
    }
)

print(response.json())
```

### Parâmetros:

- **channel_link**: Link do canal do Telegram
- **limit**: Número máximo de mensagens para processar (padrão: 50)
- **auto_status**: Status inicial dos manhwas importados
  - `plan_to_read`: Pretendo ler
  - `reading`: Lendo
  - `completed`: Concluído

## 📝 Como Funciona

1. **Conexão**: O scraper conecta ao Telegram usando suas credenciais
2. **Busca**: Busca as últimas mensagens do canal especificado
3. **Extração**: Analisa cada mensagem procurando por:
   - Título do manhwa
   - Número do capítulo atual
   - Imagens de capa
   - Outras informações relevantes
4. **Importação**: Adiciona os manhwas encontrados ao seu banco de dados
5. **Evita duplicatas**: Verifica títulos existentes antes de adicionar

## 🔍 Endpoints da API

### `GET /api/telegram/test`
Testa se as configurações do Telegram estão corretas.

**Resposta:**
```json
{
  "configured": true,
  "config": {
    "api_id": "✓ Configurado",
    "api_hash": "✓ Configurado",
    "phone": "✓ Configurado"
  },
  "message": "Todas as configurações OK!"
}
```

### `POST /api/telegram/import`
Importa manhwas de um canal do Telegram.

**Body:**
```json
{
  "channel_link": "https://t.me/c/2296450302/9",
  "limit": 50,
  "auto_status": "plan_to_read"
}
```

**Resposta:**
```json
{
  "success": true,
  "imported": 10,
  "skipped": 5,
  "total_found": 15,
  "message": "Importados 10 manhwas, 5 já existiam"
}
```

## ⚠️ Solução de Problemas

### Erro: "Import telethon could not be resolved"
```bash
pip install telethon cryptg
```

### Erro: "TELEGRAM_API_ID e TELEGRAM_API_HASH devem estar configurados"
- Verifique se o arquivo `.env` está na pasta `backend`
- Confirme que as variáveis estão corretas no arquivo

### Erro de autenticação
- Na primeira vez, você receberá um código no Telegram
- Digite o código no terminal quando solicitado
- Um arquivo `manhwa_session.session` será criado para sessões futuras

### Erro: "Could not find the input entity"
- Verifique se o link do canal está correto
- Certifique-se de que você tem acesso ao canal
- Canais privados requerem que você seja membro

## 🔒 Segurança

- **Nunca compartilhe** seu `API_ID` e `API_HASH`
- Adicione `.env` ao `.gitignore` para não versioná-lo
- Mantenha o arquivo `.session` seguro (contém sua sessão autenticada)

## 📚 Recursos Adicionais

- [Documentação Telethon](https://docs.telethon.dev/)
- [Telegram API](https://core.telegram.org/api)
- [Como criar aplicativo no Telegram](https://core.telegram.org/api/obtaining_api_id)

## 🎯 Próximos Passos

Após configurar com sucesso, você pode:

1. **Automatizar importações** com cron jobs
2. **Criar interface** no frontend para importar via botão
3. **Melhorar extração** de informações específicas do seu canal
4. **Baixar imagens** de capa automaticamente
5. **Monitorar** novos posts e importar automaticamente

