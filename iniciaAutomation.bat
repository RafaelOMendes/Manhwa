@echo off
title Automacao Trello + Claude Code - Manhwa Tracker
cls

:: Navega ate a pasta da automacao
cd /d "C:\Users\Rafa\Desktop\Programacao\Manhwa\automation"

:: Verifica se a pasta venv existe. Se nao existir, cria e instala as dependencias.
if not exist venv (
    echo [INFO] Criando ambiente virtual...
    python -m venv venv
    echo [INFO] Instalando dependencias...
    .\venv\Scripts\python.exe -m pip install -r requirements.txt
)

if not exist .env (
    echo [ERRO] Arquivo automation\.env nao encontrado.
    echo Copie automation\.env.example para automation\.env e preencha as chaves.
    echo Veja o passo a passo em automation\SETUP.md
    pause
    exit /b 1
)

echo [INFO] Iniciando o watcher do Trello...
echo [INFO] Ctrl+C para parar.
echo.

.\venv\Scripts\python.exe watcher.py

pause
