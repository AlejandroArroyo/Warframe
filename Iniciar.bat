@echo off
REM -> Cambia de unidad si hace falta
cd /d "%~dp0"
echo Iniciando dev server de React...
npm start
pause
