# Manhwa Tracker Backend

API backend para o Manhwa Tracker, construída com FastAPI.

## Configuração

1. Crie um ambiente virtual Python:
```bash
python -m venv venv
```

2. Ative o ambiente virtual:
- Windows: `venv\Scripts\activate`
- Linux/Mac: `source venv/bin/activate`

3. Instale as dependências:
```bash
pip install -r requirements.txt
```

## Executar

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


