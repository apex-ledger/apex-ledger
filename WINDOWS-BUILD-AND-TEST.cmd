@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo =====================================================
echo North Ledger Ultimate TEST - Final Windows Build Gate
echo =====================================================

where node >nul 2>&1 || (echo ERROR: Node.js not found & exit /b 10)
where npm >nul 2>&1 || (echo ERROR: npm not found & exit /b 11)

echo Node:
node --version
echo npm:
npm --version

echo.
echo [0/6] Verify TEST-build isolation
call npm run verify:test-build || exit /b 15

echo.
echo [0/6] Static release verification
node VERIFY-FINAL-RELEASE.js || exit /b 15

echo [1/6] Clean dependencies
if exist package-lock.json (
  call npm ci
  if errorlevel 1 (
    echo npm ci failed. Retrying once with npm install...
    call npm install || exit /b 20
  )
) else (
  call npm install || exit /b 21
)

echo.
echo [2/6] Native Electron SQLite rebuild
call npm run rebuild || exit /b 30

echo.
echo [3/6] Automated tests
call npm test || exit /b 40

echo.
echo [4/6] Production build
call npm run build || exit /b 50

echo.
echo [5/6] Windows TEST installer
call npm run dist || exit /b 60

echo.
echo [6/6] Collect release artifacts
set "OUT=%~dp0FINAL-TEST-ARTIFACTS"
set "REL=%~dp0release\NorthLedger-0.1.226-test"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

if not exist "%REL%\NorthLedger-Ultimate-TEST-Setup-0.1.226.exe" (
  echo ERROR: Expected installer not found:
  echo %REL%\NorthLedger-Ultimate-TEST-Setup-0.1.226.exe
  exit /b 70
)
copy /y "%REL%\NorthLedger-Ultimate-TEST-Setup-0.1.226.exe" "%OUT%\" >nul || exit /b 71
copy /y "TEST-CHECKLIST-FINAL.txt" "%OUT%\" >nul 2>&1
copy /y "RELEASE-NOTES-DRAFT-0.1.220.txt" "%OUT%\" >nul 2>&1
copy /y "ACCOUNTING-VALIDATION-SUMMARY-DRAFT.txt" "%OUT%\" >nul 2>&1

(
  echo North Ledger Ultimate TEST 0.1.226
  echo Build completed: %DATE% %TIME%
  echo Installer: NorthLedger-Ultimate-TEST-Setup-0.1.226.exe
  echo Test appId: ca.pjinsuretax.northledger.ultimate.test
) > "%OUT%\BUILD-MANIFEST.txt"

echo.
echo =====================================================
echo BUILD GATE PASSED
echo Artifacts collected at:
echo %OUT%
echo =====================================================
exit /b 0
