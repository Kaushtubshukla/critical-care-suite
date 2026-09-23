@echo off
title Critical Care Hub - Firebase Admin Deployer
color 0b
echo ======================================================================
echo    CRITICAL CARE SUITE - 1-CLICK FIREBASE ADMIN PANEL DEPLOYER
echo ======================================================================
echo.
echo [1/3] Packaging Owner Admin Portal into public_admin...
cd /d "d:\projects\demo medical"
call node bundle-admin.js
if %errorlevel% neq 0 (
    echo [ERROR] Bundling failed.
    pause
    exit /b 1
)
echo.
echo [2/3] Deploying Admin Portal to Google Firebase Hosting...
call node node_modules\firebase-tools\lib\bin\firebase.js deploy --only hosting,firestore:rules --project critical-care-hub
if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] If authentication is needed, opening Google login...
    call node node_modules\firebase-tools\lib\bin\firebase.js login
    call node node_modules\firebase-tools\lib\bin\firebase.js deploy --only hosting,firestore:rules --project critical-care-hub
    if %errorlevel% neq 0 (
        echo [ERROR] Deployment failed.
        pause
        exit /b 1
    )
)
echo.
echo ======================================================================
echo    DEPLOYMENT SUCCESSFUL!
echo.
echo    Your Admin Panel is now live worldwide:
echo    https://critical-care-hub.web.app
echo    https://critical-care-hub.firebaseapp.com
echo ======================================================================
echo.
pause
