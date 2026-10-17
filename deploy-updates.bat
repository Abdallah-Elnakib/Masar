@echo off
echo ========================================
echo Deploy Updates to Vercel
echo ========================================
echo.

REM Check if Vercel CLI is installed
where vercel >nul 2>nul
if %errorlevel% neq 0 (
    echo Vercel CLI is not installed. Installing...
    npm install -g vercel
)

REM Build the app
echo.
echo Step 1: Building app...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Build installer
echo.
echo Step 2: Building installer...
call npm run package:win
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Create updates directory
echo.
echo Step 3: Creating updates directory...
if not exist updates mkdir updates

REM Copy files to updates directory
echo.
echo Step 4: Copying files to updates directory...
copy release\*.exe updates\
copy release\*.yml updates\

REM Deploy to Vercel
echo.
echo Step 5: Deploying to Vercel...
call vercel --prod

echo.
echo ========================================
echo Deployment complete!
echo ========================================
echo.
echo Check: https://masar-indol-nine.vercel.app/updates
echo.
pause
