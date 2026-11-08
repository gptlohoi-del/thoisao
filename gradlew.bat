@echo off
setlocal
cd /d "%~dp0"
where gradle >nul 2>&1
if %errorlevel%==0 (
  gradle %*
  exit /b %errorlevel%
)
set "NHAC_GRADLE=%USERPROFILE%\.gradle\nhac-bootstrap\gradle-8.11.1\bin\gradle.bat"
if not exist "%NHAC_GRADLE%" (
  echo Downloading Gradle 8.11.1 once...
  powershell -NoProfile -Command "$p=Join-Path $env:USERPROFILE '.gradle\nhac-bootstrap'; New-Item -ItemType Directory -Force -Path $p | Out-Null; $z=Join-Path $p 'gradle.zip'; Invoke-WebRequest 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip' -OutFile $z; Expand-Archive -Path $z -DestinationPath $p -Force; Remove-Item $z"
  if errorlevel 1 exit /b 1
)
call "%NHAC_GRADLE%" %*
exit /b %errorlevel%
