@echo off
setlocal
cd /d "%~dp0"
echo Starting Hedes Studio desktop development mode...
pnpm electron:dev
