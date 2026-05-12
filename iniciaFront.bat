@echo off
title Frontend Manhwa - NPM
cls

:: Navega até o diretório do frontend
cd /d "C:\Users\Rafa\Desktop\Programacao\Manhwa\frontend"

:: Verifica se a pasta node_modules existe. Se não existir, avisa o usuário.
if not exist node_modules (
    echo [AVISO] Pasta node_modules nao encontrada.
    echo [INFO] Tentando rodar npm install...
    call npm install
)

echo [INFO] Iniciando o servidor de desenvolvimento...
echo.

:: O comando 'call' é necessário para que o script não feche ao iniciar o npm
call npm run dev

:: Se o processo parar, a janela continua aberta para ver o log de erro
pause