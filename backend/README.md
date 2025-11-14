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
