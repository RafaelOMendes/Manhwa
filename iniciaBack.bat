@echo off
title Backend Manhwa - Uvicorn
cls

:: Navega até o diretório do projeto
cd /d "C:\Users\Rafa\Desktop\Programacao\Manhwa\backend"

:: Verifica se a pasta venv existe. Se não existir, ele cria.
if not exist venv (
    echo [INFO] Criando ambiente virtual...
    python -m venv venv
)

echo [INFO] Iniciando o servidor FastAPI...
echo [INFO] Endereco: http://localhost:8000
echo.

:: Executa o uvicorn diretamente usando o python da venv
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

:: Mantém a janela aberta caso o processo pare por erro
pause