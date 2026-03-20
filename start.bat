@echo off
echo ==========================================
echo Starting Nano Banana Studio...
echo ==========================================
echo.
echo Make sure you have Node.js installed and have run 'npm install' at least once.
echo The app will open in your default browser.
echo.
cd /d "%~dp0"
call npm run dev -- --open
pause
