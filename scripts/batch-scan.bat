@echo off
cd /d "%~dp0.."
npm run batch-scan >> "%~dp0..\data\batch-scan.log" 2>&1
