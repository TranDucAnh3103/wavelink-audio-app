@echo off
set "JAVA_HOME=C:\Program Files\Java\jdk-21.0.10"
set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

echo ===================================================
echo [1/3] Preparing WaveLink Mobile v2 Standalone Release...
echo ===================================================

cd /d "%~dp0"

REM Xoa cac file APK cu de tranh nham lan voi ban debug
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    del /f /q "android\app\build\outputs\apk\debug\app-debug.apk"
)

echo ===================================================
echo [2/3] Compiling Release APK with Gradle...
echo ===================================================
cd android
call gradlew.bat assembleRelease --no-daemon
cd ..

echo ===================================================
echo [3/3] Copying Final Standalone APK...
echo ===================================================
set "TARGET_APK=wave-link-mobile-v2.apk"

if exist "android\app\build\outputs\apk\release\app-arm64-v8a-release.apk" (
    copy /Y "android\app\build\outputs\apk\release\app-arm64-v8a-release.apk" "%TARGET_APK%"
    copy /Y "android\app\build\outputs\apk\release\app-arm64-v8a-release.apk" "..\wave-link-mobile-v2.apk"
) else if exist "android\app\build\outputs\apk\release\app-universal-release.apk" (
    copy /Y "android\app\build\outputs\apk\release\app-universal-release.apk" "%TARGET_APK%"
    copy /Y "android\app\build\outputs\apk\release\app-universal-release.apk" "..\wave-link-mobile-v2.apk"
) else (
    copy /Y "android\app\build\outputs\apk\release\app-release.apk" "%TARGET_APK%"
    copy /Y "android\app\build\outputs\apk\release\app-release.apk" "..\wave-link-mobile-v2.apk"
)

echo ===================================================
echo [SUCCESS] WaveLink Mobile v2 Standalone APK is Ready!
echo Location 1: mobile\wave-link-mobile-v2.apk
echo Location 2: wave-link-mobile-v2.apk (Project Root)
echo ===================================================
