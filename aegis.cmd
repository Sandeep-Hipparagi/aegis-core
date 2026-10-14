@echo off
if "%~1"=="intercept" (
    node --experimental-strip-types "%~dp0scripts\demo-scenario-1.js" %*
    goto :eof
)
if "%~1"=="audit" (
    node --experimental-strip-types "%~dp0scripts\demo-scenario-3.js" %*
    goto :eof
)
echo %* | findstr /i "dpdp" >nul
if %errorlevel%==0 (
    node --experimental-strip-types "%~dp0scripts\demo-scenario-2.js" %*
    goto :eof
)
node --experimental-strip-types "%~dp0scripts\terminal-demo-v2.js" %*
