@echo off
set "JAVA_HOME=C:\Program Files\Java\jdk-21.0.10"
set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

echo ===================================================
echo [WaveLink Mobile] Configured Environment:
echo JAVA_HOME    : %JAVA_HOME%
echo ANDROID_HOME : %ANDROID_HOME%
echo ===================================================

npx react-native run-android %*
