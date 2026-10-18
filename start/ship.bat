@echo off
setlocal
title WaveLink Code Shipper
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ship.ps1" %*
