@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "LOG=%~dp0build-log.txt"
title Dealer Platform - build APK

echo ============================================================
echo   Dealer Platform app - build the Android APK
echo   Everything is also written to build-log.txt
echo ============================================================
echo Build started %DATE% %TIME% > "%LOG%"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Install it from https://nodejs.org ^(LTS^) and run this file again.
  echo node: NOT FOUND >> "%LOG%"
  goto :fail
)
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
echo node %NODEV% >> "%LOG%"
echo Node %NODEV%

echo.
echo [1/4] Installing packages ^(a few minutes^)...
echo ---- npm install ---- >> "%LOG%"
call npm install >> "%LOG%" 2>&1
if errorlevel 1 ( echo npm install failed. & goto :fail )

echo [2/4] Matching package versions to the Expo SDK...
echo ---- expo install --fix ---- >> "%LOG%"
call npx expo install --fix >> "%LOG%" 2>&1
if errorlevel 1 echo expo install --fix reported a problem - continuing. See build-log.txt

echo [3/4] Checking the code ^(TypeScript^)...
echo ---- tsc --noEmit ---- >> "%LOG%"
call npx tsc --noEmit >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo The code check found errors ^(listed in build-log.txt^).
  echo Tell Claude "the build stopped" and it will read the log and fix them.
  goto :fail
)
echo TSC_OK >> "%LOG%"
echo       Code check passed.

rem ---------- can this computer build Android apps itself? ----------
set "SDK=%ANDROID_HOME%"
if not defined SDK set "SDK=%ANDROID_SDK_ROOT%"
if not defined SDK if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools" set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "HAVEJAVA="
where java >nul 2>&1 && set "HAVEJAVA=1"
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "HAVEJAVA=1"
if not defined HAVEJAVA if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
  set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
  set "HAVEJAVA=1"
)
echo SDK=%SDK% HAVEJAVA=%HAVEJAVA% JAVA_HOME=%JAVA_HOME% >> "%LOG%"

if defined SDK if defined HAVEJAVA goto :local
goto :cloud

:local
echo.
echo [4/4] Building the APK on this computer ^(10 - 30 minutes the first time^)...
set "ANDROID_HOME=%SDK%"
set "ANDROID_SDK_ROOT=%SDK%"
echo ---- expo prebuild ---- >> "%LOG%"
call npx expo prebuild -p android --clean >> "%LOG%" 2>&1
if errorlevel 1 ( echo Preparing the Android project failed - trying the cloud build instead. & goto :cloud )
echo ---- gradlew assembleRelease ---- >> "%LOG%"
pushd android
call gradlew.bat assembleRelease >> "%LOG%" 2>&1
set "GR=!errorlevel!"
popd
if not "!GR!"=="0" ( echo The local build failed - trying the cloud build instead. & goto :cloud )
copy /y "android\app\build\outputs\apk\release\app-release.apk" "%~dp0dealer-platform.apk" >nul
if errorlevel 1 ( echo The APK was built but could not be copied. & goto :fail )
echo APK_OK local >> "%LOG%"
echo.
echo ============================================================
echo   DONE. The app is here:
echo   %~dp0dealer-platform.apk
echo   Copy it to the phone and open it to install.
echo ============================================================
goto :end

:cloud
echo.
echo [4/4] Building the APK in the Expo cloud ^(free Expo account, about 15 minutes^).
echo       This step asks you a few questions in this window:
echo         - log in to your Expo account ^(create one free at https://expo.dev/signup^)
echo         - "create a project?"            answer  Y
echo         - "generate a new keystore?"     answer  Y
echo.
set "EAS_NO_VCS=1"
echo ---- eas (cloud) ---- >> "%LOG%"
call npx --yes eas-cli@latest whoami >nul 2>&1
if errorlevel 1 call npx --yes eas-cli@latest login
if errorlevel 1 ( echo Expo login failed. & echo EAS_LOGIN_FAILED >> "%LOG%" & goto :fail )
call npx --yes eas-cli@latest build -p android --profile preview
if errorlevel 1 ( echo The cloud build did not finish. & echo EAS_BUILD_FAILED >> "%LOG%" & goto :fail )
echo APK_OK cloud >> "%LOG%"
echo.
echo ============================================================
echo   DONE. Open the link shown above on the phone ^(or scan the
echo   QR code^) to download and install the APK.
echo ============================================================
goto :end

:fail
echo BUILD_STOPPED >> "%LOG%"
echo.
echo The build stopped. Details are in build-log.txt.

:end
echo Finished %DATE% %TIME% >> "%LOG%"
echo.
pause
endlocal
