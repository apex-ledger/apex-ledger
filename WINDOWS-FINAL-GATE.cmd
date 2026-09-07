@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo North Ledger Ultimate - Windows Gate
echo ========================================
where node >nul 2>&1 || (echo ERROR: Node.js not found & exit /b 10)
where npm >nul 2>&1 || (echo ERROR: npm not found & exit /b 11)
node --version
npm --version

echo [1/5] Clean dependency install
if exist package-lock.json (
  call npm ci || exit /b 20
) else (
  call npm install || exit /b 21
)

echo [2/5] Native rebuild
call npm run rebuild || exit /b 30

echo [3/5] Automated tests
call npm test || exit /b 40

echo [4/5] Production build
call npm run build || exit /b 50

echo [5/5] Windows package
call npm run dist || call npm run package || exit /b 60

echo ========================================
echo BUILD GATE PASSED - inspect installer output
exit /b 0
